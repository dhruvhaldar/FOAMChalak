/**
 * Slice Visualization Module
 * Handles slice generation using PyVista, and 3D visualization using Trame
 * 
 * When making changes to the frontend, always edit slice.ts and build slice.js using `npm run build`
 */

// Type definitions
interface SliceOptions {
    tutorial?: string | null;
    caseDir?: string | { value: string } | null;
    scalarField?: string;
    normal?: string;
    range?: [number, number];
    vtkFilePath?: string | null;
    colorMap?: string;
}

interface SliceData {
    tutorial: string;
    caseDir: string;
    scalarField: string;
    normal: string;
    timestamp: string;
    vtkFilePath?: string;
    colorMap?: string;
}

// Extend HTMLElement for custom properties
interface MyHTMLElement extends HTMLElement {
    value: string;
}

// Assume global functions are declared elsewhere
declare function showNotification(message: string, type?: string, duration?: number): void;

// Global state
let currentSliceData: SliceData | null = null;
let currentFieldStats: Record<string, any> | null = null;

/**
 * Generate slice slices for the loaded mesh
 * @param options - Configuration options
 * @returns Promise that resolves when slices are generated
 */
export async function generateSlices(options: SliceOptions = {}): Promise<void> {
    const slicePlaceholder = document.getElementById('slicePlaceholder');
    const sliceViewer = document.getElementById('sliceViewer');

    // Default options
    // Default options (don't default scalarField/num_slices yet, check DOM first)
    const {
        tutorial = null,
        caseDir = null,
        vtkFilePath = null
    } = options;

    let { scalarField, normal, colorMap } = options;

    // UX: Loading state
    const btn = document.getElementById("generateSlicesBtn") as HTMLButtonElement | null;
    let originalText = "";

    if (btn) {
        originalText = btn.innerHTML;
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
        btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating...`;
    }

    try {
        // Show loading state
        showLoadingState(sliceViewer, 'Generating slices...');
        slicePlaceholder?.classList.add('hidden');
        sliceViewer?.classList.remove('hidden');

        // Resolve scalarField
        if (scalarField === undefined) {
            const scalarFieldSelect = document.getElementById('scalarField') as MyHTMLElement | null;
            scalarField = scalarFieldSelect?.value || 'U_Magnitude';
        }

        // Resolve normal
        if (normal === undefined) {
            const normalSelect = document.getElementById('slice_normal') as MyHTMLElement | null;
            normal = normalSelect?.value || 'x';
        }

        // Resolve colorMap
        if (colorMap === undefined) {
            const colorMapSelect = document.getElementById('colorMap') as MyHTMLElement | null;
            colorMap = colorMapSelect?.value || 'viridis';
        }

        // Get tutorial from select if not provided
        const selectedTutorial: string = tutorial ?? getTutorialFromSelect() ?? '';
        if (!selectedTutorial) {
            throw new Error('Please select a tutorial first');
        }

        // Get case directory - handle both object and string cases
        let selectedCaseDir = '';
        if (caseDir && typeof caseDir === 'object' && 'value' in caseDir) {
            selectedCaseDir = (caseDir as { value: string }).value || '';
        } else if (typeof caseDir === 'string') {
            selectedCaseDir = caseDir;
        }

        // Try to get from the input field if still not available
        if (!selectedCaseDir) {
            const caseDirInput = document.getElementById('caseDir') as MyHTMLElement | null;
            if (caseDirInput) {
                selectedCaseDir = caseDirInput.value || '';
            }
        }

        if (!selectedCaseDir) {
            throw new Error('Case directory not set. Please set it in the Setup page.');
        }

        selectedCaseDir = String(selectedCaseDir).trim();

        // Get VTK file path if not provided
        let selectedVtkFilePath = vtkFilePath;
        if (!selectedVtkFilePath) {
            const vtkFileSelect = document.getElementById('vtkFileSelect') as MyHTMLElement | null;
            // Check custom input if select is empty or "custom"
            const vtkFileBrowser = document.getElementById('vtkFileBrowser') as HTMLInputElement | null;

            if (vtkFileBrowser && vtkFileBrowser.files && vtkFileBrowser.files.length > 0) {
                // For browser upload, we might handle it differently, but for now lets assume local path logic isn't used here 
                // actually standard vtkFileSelect is what we use for server-side files
            }

            if (vtkFileSelect && vtkFileSelect.value) {
                selectedVtkFilePath = vtkFileSelect.value;
            }
        }

        // Log for debugging
        console.log('[FOAMFlask] [generateSlices] Using case directory:', selectedCaseDir);
        if (selectedVtkFilePath) {
            console.log('[FOAMFlask] [generateSlices] Using VTK file:', selectedVtkFilePath);
        }

        // Get range from input fields if not provided in options
        let range = options.range;
        if (!range) {
            const rangeMinInput = document.getElementById('slice_rangeMin') as MyHTMLElement | null;
            const rangeMaxInput = document.getElementById('slice_rangeMax') as MyHTMLElement | null;
            const rangeMin = rangeMinInput?.value ? parseFloat(rangeMinInput.value) : null;
            const rangeMax = rangeMaxInput?.value ? parseFloat(rangeMaxInput.value) : null;

            if (
                rangeMin !== null &&
                rangeMax !== null &&
                !isNaN(rangeMin) &&
                !isNaN(rangeMax) &&
                rangeMin < rangeMax
            ) {
                range = [rangeMin, rangeMax];
                console.log('[FOAMFlask] [generateSlices] Using range from input fields:', range);
            }
        }

        console.log('[FOAMFlask] [generateSlices] Request parameters:', {
            tutorial: selectedTutorial,
            caseDir: selectedCaseDir,
            scalarField,
            normal,
            colorMap,
            range,
            vtkFilePath: selectedVtkFilePath
        });

        // Prepare request data
        const requestData: SliceOptions = {
            tutorial: selectedTutorial,
            caseDir: selectedCaseDir,
            scalarField,
            normal,
            vtkFilePath: selectedVtkFilePath,
            colorMap
        };

        if (range && Array.isArray(range) && range.length === 2) {
            requestData.range = range;
            console.log('[FOAMFlask] [generateSlices] Using range:', range);
        }

        console.log('[FOAMFlask] [generateSlices] Request data with range:', requestData);

        // API request (send as POST body)
        console.log('[FOAMFlask] [generateSlices] Calling fetchSlices...');
        const response = await fetchSlices(requestData);

        // Await the response JSON
        console.log('[FOAMFlask] [generateSlices] Reading response content...');
        const vizInfo = await response.json();
        console.log('[FOAMFlask] [generateSlices] Received visualization info:', vizInfo);

        // Display the visualization
        displaySliceVisualization(sliceViewer, vizInfo);

        // Store current data for export
        currentSliceData = {
            tutorial: selectedTutorial,
            caseDir: selectedCaseDir,
            scalarField,
            normal: normal || 'x',
            timestamp: new Date().toISOString(),
            vtkFilePath: selectedVtkFilePath || undefined,
            colorMap
        };

        console.log('[FOAMFlask] [generateSlices] Slices generated successfully!');

        if (typeof showNotification === 'function') {
            showNotification('Slices generated successfully!', 'success');
        }

    } catch (error: unknown) {
        console.error('[FOAMFlask] [generateSlices] Error:', error);
        handleSliceError(slicePlaceholder, sliceViewer, error);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.removeAttribute("aria-busy");
            btn.innerHTML = originalText;
        }
    }
}

/**
 * Load mesh metadata for slice configuration
 * @param vtkFilePath - Path to the VTK file
 */
export async function loadSliceMesh(vtkFilePath: string): Promise<void> {
    if (!vtkFilePath) {
        if (typeof showNotification === 'function') {
            showNotification("Please select a VTK file first.", "warning");
        }
        return;
    }

    try {
        console.log("[FOAMFlask] [loadSliceMesh] Loading mesh for slice:", vtkFilePath);

        // Show loading notification
        if (typeof showNotification === 'function') {
            showNotification("Loading mesh metadata...", "info", 1000);
        }

        const response = await fetch('/api/load_mesh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file_path: vtkFilePath,
                for_slice: true
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server returned ${response.status}: ${errorText}`);
        }

        const meshInfo = await response.json();
        console.log("[FOAMFlask] [loadSliceMesh] Mesh info loaded:", meshInfo);

        if (meshInfo.error) {
            throw new Error(meshInfo.error);
        }

        // Store field stats for auto-ranging
        if (meshInfo.field_stats) {
            currentFieldStats = meshInfo.field_stats;
        }

        // Populate Scalar Fields
        const scalarFieldSelect = document.getElementById('slice_scalarField') as HTMLSelectElement | null;
        if (scalarFieldSelect && meshInfo.point_arrays) {
            scalarFieldSelect.innerHTML = ''; // Clear existing

            // Add options
            meshInfo.point_arrays.forEach((field: string) => {
                const option = document.createElement('option');
                option.value = field;
                option.textContent = field;
                option.classList.add('point-data-option'); // Add styling class
                scalarFieldSelect.appendChild(option);
            });

            // If U_Magnitude exists, select it by default, otherwise select first
            if (meshInfo.point_arrays.includes('U_Magnitude')) {
                scalarFieldSelect.value = 'U_Magnitude';
            } else if (meshInfo.point_arrays.length > 0) {
                scalarFieldSelect.value = meshInfo.point_arrays[0];
            }

            // Setup listeners and update ranges for the initial selection
            setupScalarFieldListeners();
            updateRangeInputs(scalarFieldSelect.value);
        }

        // Populate Info Box
        const sliceInfo = document.getElementById('slice_sliceInfo');
        const sliceInfoContent = document.getElementById('slice_sliceInfoContent');
        if (sliceInfo && sliceInfoContent) {
            sliceInfo.classList.remove('hidden');
            sliceInfoContent.innerHTML = `
                <div><span class="font-semibold">Points:</span> ${meshInfo.n_points}</div>
                <div><span class="font-semibold">Cells:</span> ${meshInfo.n_cells}</div>
                <div class="col-span-2"><span class="font-semibold">Fields:</span> ${meshInfo.point_arrays ? meshInfo.point_arrays.length : 0}</div>
            `;
        }

        if (typeof showNotification === 'function') {
            showNotification("Mesh loaded for slice configuration!", "success");
        }

        // Optionally clear ranges to suggest "Auto" or just leave them
        // For now, let's not aggressively clear them unless requested

    } catch (error: unknown) {
        console.error('[FOAMFlask] [loadSliceMesh] Error:', error);
        if (typeof showNotification === 'function') {
            const message = error instanceof Error ? error.message : String(error);
            showNotification(`Error loading mesh: ${message}`, 'error', 0);
        }
    }
}

/**
 * Show loading state in the viewer
 */
function showLoadingState(container: HTMLElement | null, message = 'Loading...') {
    if (!container) return;

    container.innerHTML = `
        <div class="flex items-center justify-center h-full">
            <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-600"></div>
            <span class="ml-4 text-gray-600"></span>
        </div>
    `;

    // Set message text safely
    const messageSpan = container.querySelector('span');
    if (messageSpan) {
        messageSpan.textContent = message;
    }
}

/**
 * Get selected tutorial from dropdown
 */
function getTutorialFromSelect(): string | null {
    const tutorialSelect = document.getElementById('tutorialSelect') as MyHTMLElement | null;
    return tutorialSelect ? tutorialSelect.value : null;
}

/**
 * Fetch slices from the server
 * Send all data in the request body to avoid URL encoding issues with Windows paths
 */
async function fetchSlices(requestData: SliceOptions) {
    const url = new URL('/api/slice/create', window.location.origin);

    console.log('[FOAMFlask] [fetchSlices] URL:', url.toString());
    console.log('[FOAMFlask] [fetchSlices] Origin:', window.location.origin);
    console.log('[FOAMFlask] [fetchSlices] Request data:', requestData);

    // Prepare the request body
    const requestBody: {
        tutorial?: string | null;
        caseDir?: string | { value: string } | null;
        scalar_field?: string;
        normal?: string;
        range?: [number, number];
        vtkFilePath?: string | null;
        colormap?: string;
    } = {
        tutorial: requestData.tutorial,
        caseDir: requestData.caseDir,
        scalar_field: requestData.scalarField,
        normal: requestData.normal,
        vtkFilePath: requestData.vtkFilePath,
        colormap: requestData.colorMap // Map frontend camelCase to backend snake_case
    };

    if (requestData.range && Array.isArray(requestData.range) && requestData.range.length === 2) {
        requestBody.range = requestData.range;
        console.log('[FOAMFlask] [fetchSlices] Including range in request:', requestData.range);
    }

    const body = JSON.stringify(requestBody);

    try {
        console.log('[FOAMFlask] [fetchSlices] Sending fetch request...');

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/html, application/xhtml+xml'
            },
            body,
            mode: 'cors',
            credentials: 'same-origin'
        });

        console.log('[FOAMFlask] [fetchSlices] Response received');
        console.log('[FOAMFlask] [fetchSlices] Status:', response.status);
        console.log('[FOAMFlask] [fetchSlices] Status text:', response.statusText);
        console.log('[FOAMFlask] [fetchSlices] Content-Type:', response.headers.get('Content-Type'));

        if (!response.ok) {
            const errorText = await response.text();
            let displayError = errorText;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.error) displayError = errorJson.error;
            } catch (e) {
                // Not JSON, use raw text
            }
            console.error('[FOAMFlask] [fetchSlices] Error response:', displayError);
            throw new Error(displayError);
        }

        return response;

    } catch (error: unknown) {
        console.error('[FOAMFlask] [fetchSlices] Fetch failed:', error);

        if (error instanceof Error && error.message.includes('Failed to fetch')) {
            console.error('[FOAMFlask] [fetchSlices] Network error details:');
            console.error('  - Server URL:', url.toString());
            console.error('  - Your page origin:', window.location.origin);
            console.error('  - Check if Flask server is running on that address');
        }

        throw error;
    }
}

/**
 * Display the slice visualization in the viewer
 */
function displaySliceVisualization(container: HTMLElement | null, content: any) {
    if (!container) {
        console.error('[FOAMFlask] [displaySliceVisualization] Container not found');
        return;
    }

    try {
        // Clear the container first
        container.innerHTML = '';

        // Create an iframe to contain the visualization
        const iframe = document.createElement('iframe');
        iframe.id = 'sliceVisualizationFrame';
        iframe.setAttribute('scrolling', 'no'); // Legacy attribute, still useful
        iframe.style.cssText = `
            width: 100%;
            height: 600px;
            border: none;
            border-radius: 0.5rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            background: white;
            overflow: hidden; /* Ensure iframe container doesn't scroll */
        `;

        // Handle Trame URL
        if (content.mode === 'iframe' && content.src) {
            // Append timestamp to force reload/prevent caching
            const url = new URL(content.src);
            url.searchParams.set('t', Date.now().toString());
            const finalUrl = url.toString();

            console.log('[FOAMFlask] [displaySliceVisualization] Embedding Trame URL:', finalUrl);
            iframe.src = finalUrl;
        } else if (content.status === 'error' && content.message) {
            // Server returned a structured error (e.g. timeout waiting for Trame subprocess)
            console.error('[FOAMFlask] [displaySliceVisualization] Server error:', content.message);
            container.innerHTML = `
                <div class="p-4 text-red-600 bg-red-50 rounded-lg">
                    <h3 class="font-semibold">Error displaying visualization</h3>
                    <p class="text-sm mt-1">${content.message}</p>
                </div>
            `;
            return;
        } else {
            console.warn('[FOAMFlask] [displaySliceVisualization] Unexpected content format', content);
            container.innerHTML = `
                <div class="p-4 text-red-600 bg-red-50 rounded-lg">
                    <h3 class="font-semibold">Error displaying visualization</h3>
                    <p class="text-sm mt-1">Received unexpected response format from server.</p>
                </div>
            `;
            return;
        }

        container.appendChild(iframe);

        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 500);

    } catch (error) {
        console.error('[FOAMFlask] [displaySliceVisualization] Error:', error);
        if (container) {
            const message = error instanceof Error ? error.message : 'Unknown error occurred';
            container.innerHTML = `
                <div class="p-4 text-red-600 bg-red-50 rounded-lg">
                    <h3 class="font-semibold">Error displaying visualization</h3>
                    <p class="text-sm mt-1">${message}</p>
                </div>
            `;
        }
    }
}



/**
 * Handle errors during slice generation
 */
function handleSliceError(
    placeholder: HTMLElement | null,
    viewer: HTMLElement | null,
    error: unknown
) {
    if (placeholder) placeholder.classList.remove('hidden');
    if (viewer) viewer.classList.add('hidden');

    let errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    // 🎨 Palette UX: Detect specific errors and provide better feedback
    if (errorMessage.includes("Empty meshes cannot be plotted") || errorMessage.includes("zero points")) {
        errorMessage = "The selected parameters (isovalues/range) resulted in an empty slice. Please try different values within the data bounds.";
    }

    if (typeof showNotification === 'function') {
        // Sanitize message to avoid selector errors if it contains quotes
        const safeMessage = errorMessage.replace(/["']/g, '');
        // 🏗️ Architectural Decision: Error notifications for post-processing should be persistent (duration=0)
        showNotification(safeMessage, 'error', 0);
    }

    if (viewer) {
        viewer.innerHTML = `
            <div class="p-8 text-center">
                <div class="text-red-600 text-lg font-semibold mb-4">
                    ⚠️ Error Generating Slices
                </div>
                <div class="text-gray-600 mb-4"></div>
                <div class="text-sm text-gray-500 mt-4 p-4 bg-gray-50 rounded">
                    <p><strong>Troubleshooting:</strong></p>
                    <ul class="text-left mt-2">
                        <li>✓ Ensure you've selected a tutorial in the Setup page</li>
                        <li>✓ Ensure the case directory is set correctly</li>
                        <li>✓ Ensure you've run 'foamToVTK' to generate VTK files</li>
                        <li>✓ Check the browser console for more details</li>
                        <li>✓ Check the Flask server logs for backend errors</li>
                    </ul>
                </div>
                <button 
                    onclick="generateSlices()" 
                    title="Retry generating slices"
                    aria-label="Try Again: Retry generating slices"
                    class="mt-4 px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2">
                    Try Again
                </button>
            </div>
        `;

        // Set error message safely
        const errorDiv = viewer.querySelector('.text-gray-600.mb-4');
        if (errorDiv) {
            errorDiv.textContent = errorMessage;
        }
    }
}

/**
 * Generate slices with custom parameters from UI controls
 */
export async function generateSlicesWithParams() {
    try {
        const scalarFieldSelect = document.getElementById('slice_scalarField') as MyHTMLElement | null;
        const normalSelect = document.getElementById('slice_normal') as MyHTMLElement | null;

        const scalarField = scalarFieldSelect?.value || 'U_Magnitude';
        const normal = normalSelect?.value || 'x';

        // Get tutorial from select (same logic as generateSlices)
        const selectedTutorial = getTutorialFromSelect() ?? '';
        if (!selectedTutorial) {
            if (typeof showNotification === 'function') {
                showNotification('Please select a tutorial first', 'warning');
            }
            return;
        }

        // Get case directory from input field (same logic as generateSlices)
        const caseDirInput = document.getElementById('caseDir') as MyHTMLElement | null;
        const selectedCaseDir = caseDirInput?.value || '';
        if (!selectedCaseDir) {
            if (typeof showNotification === 'function') {
                showNotification('Case directory not set. Please set it in the Setup page.', 'warning');
            }
            return;
        }

        console.log('[FOAMFlask] [generateSlicesWithParams] Generating slices with parameters:', {
            tutorial: selectedTutorial,
            caseDir: selectedCaseDir,
            scalarField,
            normal
        });

        // Pass all required properties with real values
        await generateSlices({
            tutorial: selectedTutorial,
            caseDir: selectedCaseDir,
            scalarField,
            normal,
            colorMap: (document.getElementById('slice_colorMap') as MyHTMLElement)?.value
        });
    } catch (error: unknown) {
        if (typeof showNotification === 'function') {
            const message = error instanceof Error ? error.message : String(error);
            showNotification(`Error: ${message}`, 'error');
        }
    }
}

/**
 * Download slice visualization as image
 */
export function downloadSliceImage() {
    if (!currentSliceData) {
        if (typeof showNotification === 'function') {
            showNotification('No slice visualization available to download', 'warning');
        }
        return;
    }

    const sliceViewer = document.getElementById('sliceViewer');
    const iframe = document.getElementById('sliceVisualizationFrame') as HTMLIFrameElement | null;
    if (!sliceViewer || !iframe || !iframe.contentDocument) return;

    const canvas = iframe.contentDocument.querySelector('canvas');
    if (!canvas) {
        if (typeof showNotification === 'function') {
            showNotification('Cannot download: visualization not rendered as canvas', 'error');
        }
        return;
    }

    try {
        canvas.toBlob((blob: Blob | null) => {
            if (!blob) {
                if (typeof showNotification === 'function') {
                    showNotification('Failed to create image blob', 'error');
                }
                return;
            }

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            // Null check before accessing scalarField
            link.download = `slice_${currentSliceData?.scalarField || 'unknown'}_${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            if (typeof showNotification === 'function') {
                showNotification('Slice image downloaded successfully', 'success');
            }
        });
    } catch (error: unknown) {
        if (typeof showNotification === 'function') {
            showNotification('Failed to download slice image', 'error');
        }
    }
}

/**
 * Export slice data as JSON
 */
export function exportSliceData() {
    if (!currentSliceData) {
        if (typeof showNotification === 'function') {
            showNotification('No slice data available to export', 'warning');
        }
        return;
    }

    const dataStr = JSON.stringify(currentSliceData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `slice_data_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (typeof showNotification === 'function') {
        showNotification('Slice data exported successfully', 'success');
    }
}

/**
 * Reset slice viewer to initial state
 */
export function resetSliceViewer() {
    const slicePlaceholder = document.getElementById('slicePlaceholder');
    const sliceViewer = document.getElementById('sliceViewer');

    if (slicePlaceholder) slicePlaceholder.classList.remove('hidden');
    if (sliceViewer) {
        sliceViewer.classList.add('hidden');
        sliceViewer.innerHTML = '';
    }

    currentSliceData = null;
}

/**
 * Update UI range controls and the isovalue slider using stored statistics for the given scalar field.
 * Updates the numeric min/max inputs, the formatted displayMin/displayMax text, reveals the scalar range card,
 * and sets the isovalue slider's min, max, step, value, and display text when statistics for `fieldName` exist.
 * @param fieldName - The scalar field key to read statistics from `currentFieldStats`; no action is taken if stats are missing
 */
function updateRangeInputs(fieldName: string): void {
    if (!currentFieldStats || !currentFieldStats[fieldName]) return;

    const stats = currentFieldStats[fieldName];
    // Handle both vector (magnitude_stats) and scalar (direct stats)
    const min = stats.type === 'vector' ? stats.magnitude_stats?.min : stats.min;
    const max = stats.type === 'vector' ? stats.magnitude_stats?.max : stats.max;

    if (min !== undefined && max !== undefined) {
        const minInput = document.getElementById('slice_rangeMin') as HTMLInputElement;
        const maxInput = document.getElementById('slice_rangeMax') as HTMLInputElement;
        const displayMin = document.getElementById('displayMin');
        const displayMax = document.getElementById('displayMax');
        const scalarRangeCard = document.getElementById('scalarRangeCard');

        if (minInput) minInput.value = min.toString();
        if (maxInput) maxInput.value = max.toString();
        if (displayMin) displayMin.textContent = parseFloat(min).toFixed(4);
        if (displayMax) displayMax.textContent = parseFloat(max).toFixed(4);
        if (scalarRangeCard) scalarRangeCard.classList.remove('hidden');

        // Update slider as well
        const slider = document.getElementById('slice_isovalueSlider') as HTMLInputElement;
        const display = document.getElementById('isovalueDisplay');

        if (slider) {
            slider.min = min.toString();
            slider.max = max.toString();
            slider.step = ((max - min) / 100).toString();
            // Keep relative position or reset to center? Reset to center for now.
            slider.value = ((max + min) / 2).toString();
            if (display) display.textContent = parseFloat(slider.value).toFixed(2);
        }
    }
}

/**
 * Reset range inputs to global min/max for current field
 */
(window as any).resetScalarRange = (): void => {
    const scalarFieldSelect = document.getElementById('slice_scalarField') as HTMLSelectElement;
    if (scalarFieldSelect && scalarFieldSelect.value) {
        updateRangeInputs(scalarFieldSelect.value);
        if (typeof showNotification === 'function') {
            showNotification("Range reset to data bounds", "success", 1500);
        }
    }
};

/**
 * Setup listeners for scalar field changes
 */
function setupScalarFieldListeners(): void {
    const scalarFieldSelect = document.getElementById('slice_scalarField') as HTMLSelectElement;
    if (scalarFieldSelect) {
        // Remove old listener to avoid duplicates if called multiple times?
        // Ideally we should use a named function or check if attached.
        // For simplicity, we'll just set onchange (replacing old one)
        scalarFieldSelect.onchange = () => {
            updateRangeInputs(scalarFieldSelect.value);
        };
    }
}

/**
 * Initialize the widget logic (event listeners)
 */
export function initIsovalueWidget(): void {
    // Slice view no longer uses isovalue widget
}

// Initialize on load
// Initialize when DOM is ready or immediately if already loaded
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initIsovalueWidget);
    } else {
        initIsovalueWidget();
    }
}
