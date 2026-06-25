
use pyo3::prelude::*;
use std::fs::File;
use std::path::Path;
use memmap2::MmapOptions;
use regex::bytes::Regex;
use std::sync::OnceLock;
use std::io::Read;

// Pre-compiled regexes
static RE_INTERNAL_FIELD: OnceLock<Regex> = OnceLock::new();
static RE_NONUNIFORM: OnceLock<Regex> = OnceLock::new();
static RE_UNIFORM: OnceLock<Regex> = OnceLock::new();

fn get_re_internal_field() -> &'static Regex {
    RE_INTERNAL_FIELD.get_or_init(|| Regex::new(r"internalField").unwrap())
}

fn get_re_nonuniform() -> &'static Regex {
    RE_NONUNIFORM.get_or_init(|| Regex::new(r"nonuniform").unwrap())
}

fn get_re_uniform() -> &'static Regex {
    // uniform <value>; or uniform (<value>);
    RE_UNIFORM.get_or_init(|| Regex::new(r"uniform\s+([^\s;]+|[^\s;]+\s+[^\s;]+\s+[^\s;]+|\([^\)]+\));").unwrap())
}

#[pyfunction]
fn parse_scalar_field(py: Python, path: String) -> PyResult<Option<f64>> {
    py.allow_threads(|| {
        let path = Path::new(&path);

        // ⚡ Bolt Optimization: Use EAFP to avoid redundant Path.exists() check
        let file = match File::open(path) {
            Ok(f) => f,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.into()),
        };
        // Check if file is empty
        if file.metadata()?.len() == 0 {
            return Ok(None);
        }

        let mmap = unsafe { MmapOptions::new().map(&file)? };

        // 1. Search for internalField
        let re_int = get_re_internal_field();
        if let Some(mat) = re_int.find(&mmap) {
            let start_search = mat.end();
            let search_window = &mmap[start_search..std::cmp::min(start_search + 500, mmap.len())];

            // 2. Check for nonuniform
            let re_non = get_re_nonuniform();
            if let Some(non_mat) = re_non.find(search_window) {
                // Find list start '('
                // We search from where nonuniform ended in the window
                let offset = start_search + non_mat.end();

                // Search for '('
                let mut paren_start = None;
                for i in offset..mmap.len() {
                    if mmap[i] == b'(' {
                        paren_start = Some(i);
                        break;
                    }
                }

                if let Some(start) = paren_start {
                    // Find matching ')'
                    // Usually before boundaryField
                    // For speed, let's just search for the last ')' before EOF or before "boundaryField"
                    // But robustly, we should scan forward.
                    // Assuming well-formed file.

                    // Let's find "boundaryField"
                    let boundary_re = Regex::new(r"boundaryField").unwrap();
                    let end_limit = if let Some(b_mat) = boundary_re.find_at(&mmap, start) {
                        b_mat.start()
                    } else {
                        mmap.len()
                    };

                    // Find last ')' in range
                    let mut paren_end = None;
                    for i in (start..end_limit).rev() {
                        if mmap[i] == b')' {
                            paren_end = Some(i);
                            break;
                        }
                    }

                    if let Some(end) = paren_end {
                        let list_content = &mmap[start+1..end];
                        // Parse numbers (simulating np.mean)
                        // We can iterate and parse.
                        // This is potentially faster than allocating a string and calling split

                        let mut sum = 0.0;
                        let mut count = 0;

                        // Fast ASCII float parsing
                        for chunk in list_content.split(|b| *b == b' ' || *b == b'\n' || *b == b'\t' || *b == b'\r') {
                            if !chunk.is_empty() {
                                // Check if it looks like a number
                                if chunk[0].is_ascii_digit() || chunk[0] == b'-' || chunk[0] == b'+' || chunk[0] == b'.' {
                                    // unsafe from_utf8_unchecked is fine if we trust split
                                    if let Ok(s) = std::str::from_utf8(chunk) {
                                         if let Ok(val) = s.parse::<f64>() {
                                             sum += val;
                                             count += 1;
                                         }
                                    }
                                }
                            }
                        }

                        if count > 0 {
                            return Ok(Some(sum / count as f64));
                        }
                    }
                }
            } else {
                // Check for uniform
                let re_uni = get_re_uniform();
                if let Some(caps) = re_uni.captures(search_window) {
                     if let Some(val_match) = caps.get(1) {
                         if let Ok(s) = std::str::from_utf8(val_match.as_bytes()) {
                             if let Ok(val) = s.parse::<f64>() {
                                 return Ok(Some(val));
                             }
                         }
                     }
                }
            }
        }

        Ok(None)
    })
}

#[pyfunction]
fn parse_vector_field(py: Python, path: String) -> PyResult<(f64, f64, f64)> {
    py.allow_threads(|| {
        let path = Path::new(&path);

        // ⚡ Bolt Optimization: Use EAFP to avoid redundant Path.exists() check
        let file = match File::open(path) {
            Ok(f) => f,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok((0.0, 0.0, 0.0)),
            Err(e) => return Err(e.into()),
        };
        if file.metadata()?.len() == 0 {
            return Ok((0.0, 0.0, 0.0));
        }

        let mmap = unsafe { MmapOptions::new().map(&file)? };

        let re_int = get_re_internal_field();
        if let Some(mat) = re_int.find(&mmap) {
            let start_search = mat.end();
            let search_window = &mmap[start_search..std::cmp::min(start_search + 500, mmap.len())];

            let re_non = get_re_nonuniform();
            if let Some(non_mat) = re_non.find(search_window) {
                 let offset = start_search + non_mat.end();
                 let mut paren_start = None;
                 for i in offset..mmap.len() {
                    if mmap[i] == b'(' {
                        paren_start = Some(i);
                        break;
                    }
                }

                if let Some(start) = paren_start {
                     // Find boundaryField
                    let boundary_re = Regex::new(r"boundaryField").unwrap();
                    let end_limit = if let Some(b_mat) = boundary_re.find_at(&mmap, start) {
                        b_mat.start()
                    } else {
                        mmap.len()
                    };

                    let mut paren_end = None;
                    for i in (start..end_limit).rev() {
                        if mmap[i] == b')' {
                            paren_end = Some(i);
                            break;
                        }
                    }

                    if let Some(end) = paren_end {
                        let list_content = &mmap[start+1..end];

                        let mut sum_x = 0.0;
                        let mut sum_y = 0.0;
                        let mut sum_z = 0.0;
                        let mut count = 0;

                        // Vectors are (x y z)
                        // We can split by ')' to get chunks like "(x y z" (preceding '(' is gone if we split by space)
                        // Actually, simpler to just parse all numbers and group by 3.

                        // Replace '(' and ')' with space (virtually) and split
                        // Since we are iterating, we can just skip parens

                        let mut val_idx = 0; // 0=x, 1=y, 2=z

                        for chunk in list_content.split(|b| *b == b' ' || *b == b'\n' || *b == b'\t' || *b == b'\r' || *b == b'(' || *b == b')') {
                             if !chunk.is_empty() {
                                if chunk[0].is_ascii_digit() || chunk[0] == b'-' || chunk[0] == b'+' || chunk[0] == b'.' {
                                    if let Ok(s) = std::str::from_utf8(chunk) {
                                         if let Ok(val) = s.parse::<f64>() {
                                             match val_idx {
                                                 0 => sum_x += val,
                                                 1 => sum_y += val,
                                                 2 => {
                                                     sum_z += val;
                                                     count += 1;
                                                 }
                                                 _ => {}
                                             }
                                             val_idx = (val_idx + 1) % 3;
                                         }
                                    }
                                }
                             }
                        }

                        if count > 0 {
                            let n = count as f64;
                            return Ok((sum_x / n, sum_y / n, sum_z / n));
                        }
                    }
                }

            } else {
                 // uniform (<val> <val> <val>);
                 let re_uni = get_re_uniform();
                 if let Some(caps) = re_uni.captures(search_window) {
                     if let Some(val_match) = caps.get(1) {
                         let s = std::str::from_utf8(val_match.as_bytes()).unwrap_or("");
                         // remove parens
                         // ⚡ Bolt Optimization: Use replace with array for single pass allocation
                         let clean = s.replace(&['(', ')'][..], "");
                         let parts: Vec<&str> = clean.split_whitespace().collect();
                         if parts.len() == 3 {
                             let x = parts[0].parse::<f64>().unwrap_or(0.0);
                             let y = parts[1].parse::<f64>().unwrap_or(0.0);
                             let z = parts[2].parse::<f64>().unwrap_or(0.0);
                             return Ok((x, y, z));
                         }
                     }
                 }
            }
        }

        Ok((0.0, 0.0, 0.0))
    })
}

#[pymodule]
fn accelerator(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(parse_scalar_field, m)?)?;
    m.add_function(wrap_pyfunction!(parse_vector_field, m)?)?;
    Ok(())
}
