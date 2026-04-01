# fix_git_case.ps1
# Description: Detects and fixes Git index entries with different cases for the same file on Windows.
# Author: Antigravity

$repoRoot = (git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) {
    Write-Error "Not a git repository."
    exit 1
}

Push-Location $repoRoot

Write-Host "🔍 Scanning Git index for case collisions..." -ForegroundColor Gray

# Find all files in the Git index
$allFiles = git ls-files

# Group by lowercase name to find duplicates
$duplicates = $allFiles | Group-Object { $_.ToLower() } | Where-Object { $_.Count -gt 1 }

if (-not $duplicates) {
    Write-Host "✅ No case-insensitive duplicates found in the Git index." -ForegroundColor Green
    Pop-Location
    exit 0
}

Write-Host "⚠️ Found $($duplicates.Count) case-insensitive collisions in the index:" -ForegroundColor Yellow

$toRemove = @()

foreach ($group in $duplicates) {
    $lowerPath = $group.Name
    Write-Host "`n📁 Group: $lowerPath" -ForegroundColor Cyan
    
    # Use cmd /c dir to get the TRUE case from Windows for the directory/file
    # PowerShell's Get-Item can sometimes return the input case if not careful
    $actualPathOnDisk = (cmd /c "dir /b /s ""$lowerPath"" 2>nul")
    if (-not $actualPathOnDisk) {
        Write-Host "  [!] File not found on disk: $lowerPath" -ForegroundColor Red
        # If it's not on disk at all, we might want to flag all of them for manual review
        # but let's assume the user wants to keep one or it's a deleted file.
        continue
    }

    # Normalize the disk path to a relative path with forward slashes
    $relativeDisk = $actualPathOnDisk[0].Replace($repoRoot, "").TrimStart("\").Replace("\", "/")

    foreach ($file in $group.Group) {
        if ($file -ceq $relativeDisk) {
            Write-Host "  [KEEP]   $file (matches disk case)" -ForegroundColor Green
        } else {
            Write-Host "  [DELETE] $file (case mismatch in index)" -ForegroundColor Red
            $toRemove += $file
        }
    }
}

if ($toRemove.Count -gt 0) {
    Write-Host "`nFound $($toRemove.Count) entries to remove from index." -ForegroundColor Yellow
    $confirm = Read-Host "Would you like to run 'git rm --cached' on these entries? [y/N]"
    if ($confirm -eq 'y') {
        foreach ($file in $toRemove) {
            Write-Host "Executing: git rm --cached ""$file"""
            git rm --cached $file
        }
        Write-Host "`n✅ Finished. Please review and commit the changes." -ForegroundColor Green
    } else {
        Write-Host "`n❌ Cancelled. No changes made." -ForegroundColor Gray
    }
}

Pop-Location
