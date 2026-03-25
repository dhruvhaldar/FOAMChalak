/**
 * Contour Visualization Module
 * Handles isosurface generation using PyVista, and 3D visualization using Trame
 * 
 * When making changes to the frontend, always edit isosurface.ts and build isosurface.js using `npm run build`
 */

// Type definitions
interface ContourOptions {
    tutorial?: string | null;
    caseDir?: string | { value: string } | null;
    scalarField?: string;
    numIsosurfaces?: number;
    range?: [number, number];
    vtkFilePath?: string | null;
    showIsovalueWidget?: boolean;
    isovalues?: number[];
    colorMap?: string;
}

interface ContourData {
    tutorial: string;
    caseDir: string;
    scalarField: string;
    numIsosurfaces: number;
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
let currentContourData: ContourData | null = null;
let currentFieldStats: Record<string, any> | null = null;

/**
 * Generate isosurface contours for the loaded mesh
 * @param options - Configuration options
 * @returns Promise that resolves when contours are generated
 */
export async function generateContours(options: ContourOptions = {}): Promise<void> {
    const contourPlaceholder = document.getElementById('contourPlaceholder');
    const contourViewer = document.getElementById('contourViewer');

    // Default options
    // Default options (don't default scalarField/numIsosurfaces yet, check DOM first)
    const {
        tutorial = null,
        caseDir = null,
        vtkFilePath = null
    } = options;

    let { scalarField, numIsosurfaces, colorMap } = options;

    // UX: Loading state
    const btn = document.getElementById("generateContoursBtn") as HTMLButtonElement | null;
    let originalText = "";

    if (btn) {
        originalText = btn.innerHTML;
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
        btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating...`;
    }

    try {
        // Show loading state
        showLoadingState(contourViewer, 'Generating contours...');
        contourPlaceholder?.classList.add('hidden');
        contourViewer?.classList.remove('hidden');

        // Resolve scalarField
        if (scalarField === undefined) {
            const scalarFieldSelect = document.getElementById('scalarField') as MyHTMLElement | null;
            scalarField = scalarFieldSelect?.value || 'U_Magnitude';
        }

        // Resolve numIsosurfaces
        if (numIsosurfaces === undefined) {
            const numIsosurfacesInput = document.getElementById('numIsosurfaces') as MyHTMLElement | null;
            numIsosurfaces = numIsosurfacesInput?.value ? parseInt(numIsosurfacesInput.value, 10) : 10;
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
        console.log('[FOAMFlask] [generateContours] Using case directory:', selectedCaseDir);
        if (selectedVtkFilePath) {
            console.log('[FOAMFlask] [generateContours] Using VTK file:', selectedVtkFilePath);
        }

        // Get range from input fields if not provided in options
        let range = options.range;
        if (!range) {
            const rangeMinInput = document.getElementById('rangeMin') as MyHTMLElement | null;
            const rangeMaxInput = document.getElementById('rangeMax') as MyHTMLElement | null;
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
                console.log('[FOAMFlask] [generateContours] Using range from input fields:', range);
            }
        }

        console.log('[FOAMFlask] [generateContours] Request parameters:', {
            tutorial: selectedTutorial,
            caseDir: selectedCaseDir,
            scalarField,
            numIsosurfaces,
            colorMap,
            range,
            vtkFilePath: selectedVtkFilePath
        });

        // Get showIsovalueWidget from checkbox
        const showIsovalueWidgetCheckbox = document.getElementById('showIsovalueWidget') as HTMLInputElement | null;
        const showIsovalueWidget = showIsovalueWidgetCheckbox ? showIsovalueWidgetCheckbox.checked : false;

        // Toggle slider visibility
        const sliderContainer = document.getElementById('isovalueSliderContainer');
        if (sliderContainer) {
            if (showIsovalueWidget) {
                sliderContainer.classList.remove('hidden');
            } else {
                sliderContainer.classList.add('hidden');
            }
        }

        // Get slider value if enabled
        let isovalues: number[] | undefined;
        if (showIsovalueWidget) {
            const slider = document.getElementById('isovalueSlider') as HTMLInputElement;
            if (slider) {
                isovalues = [parseFloat(slider.value)];
            }
        }

        // Prepare request data
        const requestData: ContourOptions = {
            tutorial: selectedTutorial,
            caseDir: selectedCaseDir,
            scalarField,
            numIsosurfaces,
            vtkFilePath: selectedVtkFilePath,
            showIsovalueWidget,
            isovalues,
            colorMap
        };

        if (range && Array.isArray(range) && range.length === 2) {
            requestData.range = range;
            console.log('[FOAMFlask] [generateContours] Using range:', range);
        }

        console.log('[FOAMFlask] [generateContours] Request data with range:', requestData);

        // API request (send as POST body)
        console.log('[FOAMFlask] [generateContours] Calling fetchContours...');
        const response = await fetchContours(requestData);

        // Await the response JSON
        console.log('[FOAMFlask] [generateContours] Reading response content...');
        const vizInfo = await response.json();
        console.log('[FOAMFlask] [generateContours] Received visualization info:', vizInfo);

        // Display the visualization
        displayContourVisualization(contourViewer, vizInfo);

        // Store current data for export
        currentContourData = {
            tutorial: selectedTutorial,
            caseDir: selectedCaseDir,
            scalarField,
            numIsosurfaces,
            timestamp: new Date().toISOString(),
            vtkFilePath: selectedVtkFilePath || undefined,
            colorMap
        };

        console.log('[FOAMFlask] [generateContours] Contours generated successfully!');

        if (typeof showNotification === 'function') {
            showNotification('Contours generated successfully!', 'success');
        }

    } catch (error: unknown) {
        console.error('[FOAMFlask] [generateContours] Error:', error);
        handleContourError(contourPlaceholder, contourViewer, error);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.removeAttribute("aria-busy");
            btn.innerHTML = originalText;
        }
    }
}

/**
 * Load mesh metadata for contour configuration
 * @param vtkFilePath - Path to the VTK file
 */
export async function loadContourMesh(vtkFilePath: string): Promise<void> {
    if (!vtkFilePath) {
        if (typeof showNotification === 'function') {
            showNotification("Please select a VTK file first.", "warning");
        }
        return;
    }

    try {
        console.log("[FOAMFlask] [loadContourMesh] Loading mesh for contour:", vtkFilePath);

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
                for_contour: true
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server returned ${response.status}: ${errorText}`);
        }

        const meshInfo = await response.json();
        console.log("[FOAMFlask] [loadContourMesh] Mesh info loaded:", meshInfo);

        if (meshInfo.error) {
            throw new Error(meshInfo.error);
        }

        // Store field stats for auto-ranging
        if (meshInfo.field_stats) {
            currentFieldStats = meshInfo.field_stats;
        }

        // Populate Scalar Fields
        const scalarFieldSelect = document.getElementById('scalarField') as HTMLSelectElement | null;
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
        const contourInfo = document.getElementById('contourInfo');
        const contourInfoContent = document.getElementById('contourInfoContent');
        if (contourInfo && contourInfoContent) {
            contourInfo.classList.remove('hidden');
            contourInfoContent.innerHTML = `
                <div><span class="font-semibold">Points:</span> ${meshInfo.n_points}</div>
                <div><span class="font-semibold">Cells:</span> ${meshInfo.n_cells}</div>
                <div class="col-span-2"><span class="font-semibold">Fields:</span> ${meshInfo.point_arrays ? meshInfo.point_arrays.length : 0}</div>
            `;
        }

        if (typeof showNotification === 'function') {
            showNotification("Mesh loaded for contour configuration!", "success");
        }

        // Optionally clear ranges to suggest "Auto" or just leave them
        // For now, let's not aggressively clear them unless requested

    } catch (error: unknown) {
        console.error('[FOAMFlask] [loadContourMesh] Error:', error);
        if (typeof showNotification === 'function') {
            const message = error instanceof Error ? error.message : String(error);
            showNotification(`Error loading mesh: ${message}`, 'error');
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
 * Fetch contours from the server
 * Send all data in the request body to avoid URL encoding issues with Windows paths
 */
async function fetchContours(requestData: ContourOptions) {
    const url = new URL('/api/contours/create', window.location.origin);

    console.log('[FOAMFlask] [fetchContours] URL:', url.toString());
    console.log('[FOAMFlask] [fetchContours] Origin:', window.location.origin);
    console.log('[FOAMFlask] [fetchContours] Request data:', requestData);

    // Prepare the request body
    const requestBody: {
        tutorial?: string | null;
        caseDir?: string | { value: string } | null;
        scalar_field?: string;
        num_isosurfaces?: number;
        range?: [number, number];
        vtkFilePath?: string | null;
        showIsovalueWidget?: boolean;
        isovalues?: number[];
        colormap?: string;
    } = {
        tutorial: requestData.tutorial,
        caseDir: requestData.caseDir,
        scalar_field: requestData.scalarField,
        num_isosurfaces: requestData.numIsosurfaces,
        vtkFilePath: requestData.vtkFilePath,
        showIsovalueWidget: requestData.showIsovalueWidget,
        isovalues: requestData.isovalues,
        colormap: requestData.colorMap // Map frontend camelCase to backend snake_case
    };

    if (requestData.range && Array.isArray(requestData.range) && requestData.range.length === 2) {
        requestBody.range = requestData.range;
        console.log('[FOAMFlask] [fetchContours] Including range in request:', requestData.range);
    }

    const body = JSON.stringify(requestBody);

    try {
        console.log('[FOAMFlask] [fetchContours] Sending fetch request...');

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

        console.log('[FOAMFlask] [fetchContours] Response received');
        console.log('[FOAMFlask] [fetchContours] Status:', response.status);
        console.log('[FOAMFlask] [fetchContours] Status text:', response.statusText);
        console.log('[FOAMFlask] [fetchContours] Content-Type:', response.headers.get('Content-Type'));

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[FOAMFlask] [fetchContours] Error response:', errorText);
            throw new Error(`Server returned ${response.status}: ${errorText}`);
        }

        return response;

    } catch (error: unknown) {
        console.error('[FOAMFlask] [fetchContours] Fetch failed:', error);

        if (error instanceof Error && error.message.includes('Failed to fetch')) {
            console.error('[FOAMFlask] [fetchContours] Network error details:');
            console.error('  - Server URL:', url.toString());
            console.error('  - Your page origin:', window.location.origin);
            console.error('  - Check if Flask server is running on that address');
        }

        throw error;
    }
}

/**
 * Display the contour visualization in the viewer
 */
function displayContourVisualization(container: HTMLElement | null, content: any) {
    if (!container) {
        console.error('[FOAMFlask] [displayContourVisualization] Container not found');
        return;
    }

    try {
        // Clear the container first
        container.innerHTML = '';

        // Create an iframe to contain the visualization
        const iframe = document.createElement('iframe');
        iframe.id = 'contourVisualizationFrame';
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

            console.log('[FOAMFlask] [displayContourVisualization] Embedding Trame URL:', finalUrl);
            iframe.src = finalUrl;
        } else {
            console.warn('[FOAMFlask] [displayContourVisualization] Unexpected content format', content);
            container.innerHTML = `
                <div class="p-4 text-red-600 bg-red-50 rounded-lg">
                    <h3 class="font-semibold">Error displaying visualization</h3>
                    <p class="text-sm mt-1">Received unexpected response format representing from server.</p>
                </div>
            `;
            return;
        }

        container.appendChild(iframe);

        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 500);

    } catch (error) {
        console.error('[FOAMFlask] [displayContourVisualization] Error:', error);
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
 * Handle errors during contour generation
 */
function handleContourError(
    placeholder: HTMLElement | null,
    viewer: HTMLElement | null,
    error: unknown
) {
    if (placeholder) placeholder.classList.remove('hidden');
    if (viewer) viewer.classList.add('hidden');

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    if (typeof showNotification === 'function') {
        // Sanitize message to avoid selector errors if it contains quotes
        const safeMessage = errorMessage.replace(/["']/g, '');
        showNotification(`Error generating contours: ${safeMessage}`, 'error');
    }

    if (viewer) {
        viewer.innerHTML = `
            <div class="p-8 text-center">
                <div class="text-red-600 text-lg font-semibold mb-4">
                    ⚠️ Error Generating Contours
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
                    onclick="generateContours()" 
                    title="Retry generating contours"
                    aria-label="Try Again: Retry generating contours"
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
 * Generate contours with custom parameters from UI controls
 */
export async function generateContoursWithParams() {
    try {
        const scalarFieldSelect = document.getElementById('scalarField') as MyHTMLElement | null;
        const numIsosurfacesInput = document.getElementById('numIsosurfaces') as MyHTMLElement | null;

        const scalarField = scalarFieldSelect?.value || 'U_Magnitude';
        const numIsosurfaces = numIsosurfacesInput?.value ? parseInt(numIsosurfacesInput.value, 10) : 5;

        // Get tutorial from select (same logic as generateContours)
        const selectedTutorial = getTutorialFromSelect() ?? '';
        if (!selectedTutorial) {
            if (typeof showNotification === 'function') {
                showNotification('Please select a tutorial first', 'warning');
            }
            return;
        }

        // Get case directory from input field (same logic as generateContours)
        const caseDirInput = document.getElementById('caseDir') as MyHTMLElement | null;
        const selectedCaseDir = caseDirInput?.value || '';
        if (!selectedCaseDir) {
            if (typeof showNotification === 'function') {
                showNotification('Case directory not set. Please set it in the Setup page.', 'warning');
            }
            return;
        }

        console.log('[FOAMFlask] [generateContoursWithParams] Generating contours with parameters:', {
            tutorial: selectedTutorial,
            caseDir: selectedCaseDir,
            scalarField,
            numIsosurfaces
        });

        // Pass all required properties with real values
        await generateContours({
            tutorial: selectedTutorial,
            caseDir: selectedCaseDir,
            scalarField,
            numIsosurfaces,
            colorMap: (document.getElementById('colorMap') as MyHTMLElement)?.value
        });
    } catch (error: unknown) {
        if (typeof showNotification === 'function') {
            const message = error instanceof Error ? error.message : String(error);
            showNotification(`Error: ${message}`, 'error');
        }
    }
}

/**
 * Download contour visualization as image
 */
export function downloadContourImage() {
    if (!currentContourData) {
        if (typeof showNotification === 'function') {
            showNotification('No contour visualization available to download', 'warning');
        }
        return;
    }

    const contourViewer = document.getElementById('contourViewer');
    const iframe = document.getElementById('contourVisualizationFrame') as HTMLIFrameElement | null;
    if (!contourViewer || !iframe || !iframe.contentDocument) return;

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
            link.download = `contour_${currentContourData?.scalarField || 'unknown'}_${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            if (typeof showNotification === 'function') {
                showNotification('Contour image downloaded successfully', 'success');
            }
        });
    } catch (error: unknown) {
        if (typeof showNotification === 'function') {
            showNotification('Failed to download contour image', 'error');
        }
    }
}

/**
 * Export contour data as JSON
 */
export function exportContourData() {
    if (!currentContourData) {
        if (typeof showNotification === 'function') {
            showNotification('No contour data available to export', 'warning');
        }
        return;
    }

    const dataStr = JSON.stringify(currentContourData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contour_data_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (typeof showNotification === 'function') {
        showNotification('Contour data exported successfully', 'success');
    }
}

/**
 * Reset contour viewer to initial state
 */
export function resetContourViewer() {
    const contourPlaceholder = document.getElementById('contourPlaceholder');
    const contourViewer = document.getElementById('contourViewer');

    if (contourPlaceholder) contourPlaceholder.classList.remove('hidden');
    if (contourViewer) {
        contourViewer.classList.add('hidden');
        contourViewer.innerHTML = '';
    }

    currentContourData = null;
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
        const minInput = document.getElementById('rangeMin') as HTMLInputElement;
        const maxInput = document.getElementById('rangeMax') as HTMLInputElement;
        const displayMin = document.getElementById('displayMin');
        const displayMax = document.getElementById('displayMax');
        const scalarRangeCard = document.getElementById('scalarRangeCard');

        if (minInput) minInput.value = min.toString();
        if (maxInput) maxInput.value = max.toString();
        if (displayMin) displayMin.textContent = parseFloat(min).toFixed(4);
        if (displayMax) displayMax.textContent = parseFloat(max).toFixed(4);
        if (scalarRangeCard) scalarRangeCard.classList.remove('hidden');

        // Update slider as well
        const slider = document.getElementById('isovalueSlider') as HTMLInputElement;
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
    const scalarFieldSelect = document.getElementById('scalarField') as HTMLSelectElement;
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
    const scalarFieldSelect = document.getElementById('scalarField') as HTMLSelectElement;
    if (scalarFieldSelect) {
        // Remove old listener to avoid duplicates if called multiple times?
        // Ideally we should use a named function or check if attached.
        // For simplicity, we'll just set onchange (replacing old one)
        scalarFieldSelect.onchange = () => {
            updateRangeInputs(scalarFieldSelect.value);
        };
    }

    // Also update slider display on input and sync with backend
    const slider = document.getElementById('isovalueSlider') as HTMLInputElement | null;
    const display = document.getElementById('isovalueDisplay');

    if (slider && display) {
        slider.oninput = () => {
            const val = parseFloat(slider.value);
            display.textContent = val.toFixed(2);

            // Send update to Trame if active
            const iframe = document.getElementById('contourVisualizationFrame') as HTMLIFrameElement | null;
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'set_isovalue', value: val }, '*');
            }
        };

        slider.onchange = () => {
            const val = parseFloat(slider.value);
            display.textContent = val.toFixed(2);

            // Final update on release
            const iframe = document.getElementById('contourVisualizationFrame') as HTMLIFrameElement | null;
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'set_isovalue', value: val }, '*');
            } else {
                // Fallback to full regeneration if not interactive or iframe missing
                // (Only if widget is checked and we are not in a synced state)
                const checkbox = document.getElementById('showIsovalueWidget') as HTMLInputElement | null;
                if (checkbox && checkbox.checked) {
                    generateContours();
                }
            }
        };
    }
}

/**
 * Initialize the isovalue widget logic (event listeners)
 */
export function initIsovalueWidget(): void {
    const showIsovalueWidgetCheckbox = document.getElementById('showIsovalueWidget') as HTMLInputElement | null;
    const sliderContainer = document.getElementById('isovalueSliderContainer');

    if (showIsovalueWidgetCheckbox && sliderContainer) {
        // Initial state
        if (showIsovalueWidgetCheckbox.checked) {
            sliderContainer.classList.remove('hidden');
        } else {
            sliderContainer.classList.add('hidden');
        }

        // Event listener
        showIsovalueWidgetCheckbox.addEventListener('change', () => {
            if (showIsovalueWidgetCheckbox.checked) {
                sliderContainer.classList.remove('hidden');
            } else {
                sliderContainer.classList.add('hidden');
            }
        });
    }
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
