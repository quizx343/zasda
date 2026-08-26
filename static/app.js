document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const urlInput = document.getElementById('url-input');
    const pasteBtn = document.getElementById('paste-btn');
    const analyzeBtn = document.getElementById('analyze-btn');
    const urlForm = document.getElementById('url-form');
    
    // States containers
    const inputState = document.getElementById('input-state');
    const analyzingState = document.getElementById('analyzing-state');
    const previewState = document.getElementById('preview-state');
    const playlistState = document.getElementById('playlist-state');
    const downloadingState = document.getElementById('downloading-state');
    const completedState = document.getElementById('completed-state');
    const errorState = document.getElementById('error-state');
    
    // Preview Elements
    const previewThumb = document.getElementById('preview-thumb');
    const previewTitle = document.getElementById('preview-title');
    const previewDuration = document.getElementById('preview-duration');
    const previewPlatform = document.getElementById('preview-platform');
    const downloadBtn = document.getElementById('download-btn');
    const backBtn = document.getElementById('back-btn');
    const previewThumbContainer = document.getElementById('preview-thumb-container');
    const previewPlayOverlay = document.getElementById('preview-play-overlay');
    const previewIframeContainer = document.getElementById('preview-iframe-container');
    const thumbDlBtn = document.getElementById('thumb-dl-btn');
    
    if (previewThumbContainer) {
        previewThumbContainer.addEventListener('click', (e) => {
            if (previewThumbContainer.dataset.videoId) {
                const videoId = previewThumbContainer.dataset.videoId;
                previewIframeContainer.innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
                previewIframeContainer.classList.remove('hidden');
                previewPlayOverlay.classList.add('hidden');
                previewThumb.classList.add('hidden');
                previewThumbContainer.classList.remove('cursor-pointer');
                previewThumbContainer.title = '';
            } else if (currentUrl) {
                window.open(currentUrl, '_blank');
            }
        });
    }
    
    if (thumbDlBtn) {
        thumbDlBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent opening the video link when clicking download
        });
    }
    
    // Custom Dropdown Elements
    const qualityWrapper = document.getElementById('quality-wrapper');
    const qualityBtn = document.getElementById('quality-btn');
    const qualityDisplay = document.getElementById('quality-display');
    const qualityIcon = document.getElementById('quality-icon');
    const qualityDropdown = document.getElementById('quality-dropdown');
    const qualityList = document.getElementById('quality-list');
    const qualityValue = document.getElementById('quality-value');
    
    // Download Elements
    const dlProgressBar = document.getElementById('dl-progress-bar');
    const dlPercent = document.getElementById('dl-percent');
    const dlStatusDetail = document.getElementById('dl-status-detail');
    const dlSpeed = document.getElementById('dl-speed');
    const dlEta = document.getElementById('dl-eta');
    
    // Complete Elements
    const saveFileLink = document.getElementById('save-file-link');
    const downloadAnotherBtn = document.getElementById('download-another-btn');
    
    // Error Elements
    const errorTitle = document.getElementById('error-title');
    const errorMessage = document.getElementById('error-message');
    const errorBackBtn = document.getElementById('error-back-btn');

    let currentUrl = '';
    
    // --- Helpers ---
    
    function showState(stateElement) {
        [inputState, analyzingState, previewState, playlistState, downloadingState, completedState, errorState].forEach(el => {
            if(el) el.classList.add('hidden-state');
        });
        if(stateElement) stateElement.classList.remove('hidden-state');
    }
    
    function showError(title, msg) {
        errorTitle.textContent = title;
        errorMessage.textContent = msg;
        showState(errorState);
    }
    
    function formatTime(seconds) {
        if (!seconds) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function formatBytes(bytes) {
        if (!bytes) return '';
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 B';
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return Math.round(bytes / Math.pow(1024, i), 1) + ' ' + sizes[i];
    }
    
    function parseTime(str) {
        if (!str || !str.trim()) return null;
        const parts = str.trim().split(':').reverse();
        let seconds = 0;
        for (let i = 0; i < parts.length; i++) {
            seconds += parseInt(parts[i] || 0) * Math.pow(60, i);
        }
        return seconds;
    }
    
    // Trim UI Logic
    const trimToggle = document.getElementById('trim-toggle');
    const trimWrapper = document.getElementById('trim-wrapper');
    const trimInputs = document.getElementById('trim-inputs');
    
    if (trimToggle) {
        trimToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                trimWrapper.style.maxHeight = '120px';
                setTimeout(() => trimInputs.classList.remove('opacity-0'), 150);
            } else {
                trimInputs.classList.add('opacity-0');
                setTimeout(() => trimWrapper.style.maxHeight = '44px', 150);
            }
        });
    }
    
    // Custom Dropdown Logic
    let dropdownOpen = false;
    
    function toggleDropdown() {
        dropdownOpen = !dropdownOpen;
        if (dropdownOpen) {
            qualityDropdown.classList.remove('hidden');
            // small delay to allow display:block to apply before animating opacity/transform
            setTimeout(() => {
                qualityDropdown.classList.remove('opacity-0', 'scale-95');
                qualityDropdown.classList.add('opacity-100', 'scale-100');
                qualityIcon.classList.add('rotate-180');
            }, 10);
        } else {
            qualityDropdown.classList.remove('opacity-100', 'scale-100');
            qualityDropdown.classList.add('opacity-0', 'scale-95');
            qualityIcon.classList.remove('rotate-180');
            setTimeout(() => {
                qualityDropdown.classList.add('hidden');
            }, 200);
        }
    }
    
    qualityBtn.addEventListener('click', toggleDropdown);
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (dropdownOpen && !qualityBtn.contains(e.target) && !qualityDropdown.contains(e.target)) {
            toggleDropdown();
        }
    });
    
    function setQualityOption(value, text) {
        qualityValue.value = value;
        qualityDisplay.textContent = text;
        
        // Update active state in list
        const items = qualityList.querySelectorAll('li');
        items.forEach(li => {
            if (li.dataset.value === value) {
                li.classList.add('bg-primary-500/10', 'text-primary-400');
                li.classList.remove('text-zinc-200');
            } else {
                li.classList.remove('bg-primary-500/10', 'text-primary-400');
                li.classList.add('text-zinc-200');
            }
        });
        
        if (dropdownOpen) toggleDropdown();
    }
    
    function addQualityOption(value, text) {
        const li = document.createElement('li');
        li.dataset.value = value;
        li.className = 'px-4 py-2.5 text-sm cursor-pointer transition-colors hover:bg-zinc-700/50 flex items-center justify-between text-zinc-200';
        li.innerHTML = `<span>${text}</span>`;
        
        li.addEventListener('click', () => setQualityOption(value, text));
        qualityList.appendChild(li);
    }
    
    // Paste Button functionality
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            urlInput.value = text;
            urlInput.focus();
        } catch (err) {
            console.error('Failed to read clipboard', err);
        }
    });

    // Reset Flow
    function resetFlow() {
        urlInput.value = '';
        currentUrl = '';
        showState(inputState);
        urlInput.focus();
    }
    
    backBtn.addEventListener('click', () => {
        showState(inputState);
    });
    
    errorBackBtn.addEventListener('click', () => {
        showState(inputState);
        urlInput.focus();
    });
    
    downloadAnotherBtn.addEventListener('click', () => {
        urlInput.value = '';
        showState(inputState);
    });

    const tabMp4 = document.getElementById('tab-mp4');
    const tabMp3 = document.getElementById('tab-mp3');
    
    // --- Playlist Variables ---
    let playlistEntries = [];
    let playlistMode = 'mp4'; // 'mp4' or 'mp3'
    const plTabMp4 = document.getElementById('pl-tab-mp4');
    const plTabMp3 = document.getElementById('pl-tab-mp3');
    const plItemsContainer = document.getElementById('playlist-items');
    
    if (plTabMp4 && plTabMp3) {
        plTabMp4.addEventListener('click', () => {
            playlistMode = 'mp4';
            plTabMp4.className = 'flex-1 py-1.5 text-sm font-medium rounded-md bg-zinc-700 text-white shadow shadow-black/20 transition-all';
            plTabMp3.className = 'flex-1 py-1.5 text-sm font-medium rounded-md text-zinc-400 hover:text-zinc-200 transition-all';
        });
        plTabMp3.addEventListener('click', () => {
            playlistMode = 'mp3';
            plTabMp3.className = 'flex-1 py-1.5 text-sm font-medium rounded-md bg-zinc-700 text-white shadow shadow-black/20 transition-all';
            plTabMp4.className = 'flex-1 py-1.5 text-sm font-medium rounded-md text-zinc-400 hover:text-zinc-200 transition-all';
        });
    }
    
    let currentMode = 'mp4';
    let fetchedFormats = [];
    let has1080p = false;
    let currentTitle = 'video';
    
    function updateTabs() {
        const subtitlesWrapper = document.getElementById('subtitles-wrapper');
        if (currentMode === 'mp4') {
            tabMp4.className = 'flex-1 py-1.5 text-sm font-medium rounded-md bg-zinc-700 text-white shadow shadow-black/20 transition-all';
            tabMp3.className = 'flex-1 py-1.5 text-sm font-medium rounded-md text-zinc-400 hover:text-zinc-200 transition-all';
            qualityWrapper.classList.remove('hidden');
            if(subtitlesWrapper) subtitlesWrapper.classList.remove('hidden');
            downloadBtn.innerHTML = '<i data-lucide="download" class="w-4 h-4"></i><span>Download MP4</span>';
        } else {
            tabMp3.className = 'flex-1 py-1.5 text-sm font-medium rounded-md bg-zinc-700 text-white shadow shadow-black/20 transition-all';
            tabMp4.className = 'flex-1 py-1.5 text-sm font-medium rounded-md text-zinc-400 hover:text-zinc-200 transition-all';
            qualityWrapper.classList.add('hidden');
            if(subtitlesWrapper) subtitlesWrapper.classList.add('hidden');
            downloadBtn.innerHTML = '<i data-lucide="download" class="w-4 h-4"></i><span>Download MP3</span>';
        }
        lucide.createIcons();
    }
    
    tabMp4.addEventListener('click', () => { currentMode = 'mp4'; updateTabs(); });
    tabMp3.addEventListener('click', () => { currentMode = 'mp3'; updateTabs(); });

    // --- Flow: Analyze ---
    
    urlForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = urlInput.value.trim();
        if (!url) return;
        
        currentUrl = url;
        showState(analyzingState);
        currentMode = 'mp4';
        
        try {
            const response = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
            const data = await response.json();
            
            if (!response.ok) {
                if (response.status === 429) throw new Error("Too many requests. Please wait a moment.");
                throw new Error(data.detail || 'Invalid URL or video unavailable');
            }
            
            if (data.is_playlist) {
                document.getElementById('playlist-title').textContent = data.title || 'Playlist';
                document.getElementById('playlist-count').textContent = `${data.entries.length} videos found`;
                playlistEntries = data.entries;
                
                plItemsContainer.innerHTML = '';
                
                data.entries.forEach((item, idx) => {
                    const row = document.createElement('div');
                    row.className = "flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors group mb-1";
                    
                    const safeTitle = (item.title || `Video ${idx+1}`).replace(/[/\\?%*:|"<>]/g, '-');
                    
                    row.innerHTML = `
                        <label class="flex items-center cursor-pointer shrink-0">
                            <input type="checkbox" class="pl-checkbox w-4 h-4 rounded border-zinc-600 text-primary-500 bg-zinc-800" data-idx="${idx}" checked>
                        </label>
                        <div class="w-12 h-8 rounded bg-zinc-800 shrink-0 overflow-hidden">
                            <img src="${item.thumbnail || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMzMzMiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiLz48L3N2Zz4='}" class="w-full h-full object-cover">
                        </div>
                        <div class="flex-grow min-w-0">
                            <p class="text-sm font-medium text-zinc-200 truncate" title="${safeTitle}">${safeTitle}</p>
                            <div class="w-full h-1 bg-zinc-800 rounded-full mt-1.5 hidden" id="pl-prog-bg-${idx}">
                                <div class="h-full bg-primary-500 rounded-full w-0 transition-all duration-300" id="pl-prog-bar-${idx}"></div>
                            </div>
                            <p class="text-[10px] text-zinc-500 mt-0.5 hidden" id="pl-status-${idx}">Waiting...</p>
                        </div>
                        <div class="shrink-0" id="pl-action-${idx}">
                        </div>
                    `;
                    plItemsContainer.appendChild(row);
                });
                
                showState(playlistState);
                return;
            }
            
            currentTitle = data.title || 'video';
            
            previewTitle.textContent = currentTitle;
            const thumbUrl = data.thumbnail || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMzMzMiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiLz48L3N2Zz4=';
            previewThumb.src = thumbUrl;
            previewDuration.textContent = formatTime(data.duration);
            previewPlatform.textContent = data.extractor || 'Unknown';
            
            // Set Thumbnail Download Link
            const thumbDlBtn = document.getElementById('thumb-dl-btn');
            if (thumbDlBtn) {
                if (data.thumbnail) {
                    let safeTitle = currentTitle.replace(/[/\\?%*:|"<>]/g, '-');
                    thumbDlBtn.href = `/api/thumbnail?url=${encodeURIComponent(data.thumbnail)}&name=${encodeURIComponent(safeTitle + '_thumbnail.jpg')}`;
                    thumbDlBtn.style.display = 'flex';
                } else {
                    thumbDlBtn.style.display = 'none';
                }
            }
            
            // Setup inline playback
            
            if (previewThumbContainer) {
                previewIframeContainer.innerHTML = '';
                previewIframeContainer.classList.add('hidden');
                previewPlayOverlay.classList.remove('hidden');
                previewThumb.classList.remove('hidden');
                previewThumbContainer.classList.add('cursor-pointer');
                previewThumbContainer.title = 'Play Video';
                
                if (data.extractor && data.extractor.toLowerCase() === 'youtube' && data.id) {
                    previewThumbContainer.dataset.videoId = data.id;
                } else {
                    delete previewThumbContainer.dataset.videoId;
                    previewThumbContainer.title = 'Watch on original site';
                }
            }
            
            
            // Setup Quality Selector
            qualityList.innerHTML = '';
            
            // Parse and group formats by resolution height
            const groupedFormats = {};
            
            data.formats.forEach(f => {
                if (!f.resolution || f.resolution === 'audio only') return;
                
                // Extract height from e.g., "1920x1080" or just use resolution if it's already "1080p"
                let height = 0;
                let resLabel = f.resolution;
                
                if (f.resolution.includes('x')) {
                    height = parseInt(f.resolution.split('x')[1]);
                    resLabel = height + 'p';
                } else if (f.resolution.includes('p')) {
                    height = parseInt(f.resolution.replace('p', ''));
                    resLabel = f.resolution;
                } else {
                    height = parseInt(f.resolution);
                    resLabel = height + 'p';
                }
                
                if (!height) return; // Skip weird formats

                let codecInfo = '';
                let isStandard = true;
                if (f.vcodec) {
                    if (f.vcodec.startsWith('avc')) {
                        codecInfo = 'H.264';
                    } else if (f.vcodec.startsWith('av01')) {
                        codecInfo = 'AV1 - Gali prireikti VLC';
                        isStandard = false;
                    } else if (f.vcodec.startsWith('vp9')) {
                        codecInfo = 'VP9';
                        isStandard = false;
                    } else if (f.vcodec.includes('bytevc1') || f.vcodec.startsWith('hev') || f.vcodec.startsWith('h265')) {
                        codecInfo = 'HEVC - Gali prireikti VLC';
                        isStandard = false;
                    } else {
                        codecInfo = f.vcodec.split('.')[0];
                        isStandard = false;
                    }
                }

                // Prefer MP4 and H.264/avc
                let score = 0;
                if (f.ext === 'mp4') score += 10;
                if (isStandard) score += 20; // HEAVILY prefer standard H.264
                if (f.filesize) score += 1; // Tie-breaker: size available
                
                const currentBest = groupedFormats[height];
                if (!currentBest || score > currentBest.score) {
                    groupedFormats[height] = {
                        id: f.format_id,
                        label: resLabel,
                        ext: f.ext,
                        size: f.filesize,
                        score: score,
                        codecInfo: codecInfo
                    };
                }
            });
            
            // Convert to array and sort descending by height
            const cleanFormats = Object.values(groupedFormats).sort((a, b) => parseInt(b.label) - parseInt(a.label));
            
            has1080p = cleanFormats.some(f => parseInt(f.label) >= 1080);
            
            // Default "Best" option
            const bestText = has1080p ? 'Best Quality (Auto)' : 'Best Quality (1080p unavailable)';
            addQualityOption('', bestText);
            
            cleanFormats.forEach(f => {
                let text = `${f.label} (${f.ext.toUpperCase()})`;
                if (f.codecInfo) text += ` [${f.codecInfo}]`;
                if (f.size) {
                    text += ` • ${formatBytes(f.size)}`;
                }
                addQualityOption(f.id, text);
            });
            
            // Set initial selected value
            setQualityOption('', bestText);
            dropdownOpen = true; // force it closed cleanly
            toggleDropdown();
            
            // Default uncheck subs
            const embedSubsCheckbox = document.getElementById('embed-subs');
            if (embedSubsCheckbox) embedSubsCheckbox.checked = false;
            
            updateTabs();
            showState(previewState);
            
        } catch (err) {
            showError("Analysis Failed", err.message);
        }
    });

    // --- Flow: Download ---
    
    downloadBtn.addEventListener('click', async () => {
        showState(downloadingState);
        
        // Reset progress UI
        dlProgressBar.style.width = '0%';
        dlPercent.textContent = '0%';
        dlStatusDetail.textContent = 'Connecting...';
        dlSpeed.textContent = '-- MB/s';
        dlEta.textContent = 'ETA: --:--';
        
        const format_id = currentMode === 'mp3' ? 'mp3' : (qualityValue.value || null);
        
        const embedSubsCheckbox = document.getElementById('embed-subs');
        const embed_subs = embedSubsCheckbox ? embedSubsCheckbox.checked : false;
        
        let start_time = null;
        let end_time = null;
        const trimToggle = document.getElementById('trim-toggle');
        if (trimToggle && trimToggle.checked) {
            start_time = parseTime(document.getElementById('trim-start').value);
            end_time = parseTime(document.getElementById('trim-end').value);
            if (start_time === null) start_time = 0; // If end is provided but not start
        }
        
        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: currentUrl, format_id: format_id, embed_subs: embed_subs, start_time: start_time, end_time: end_time })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                if (response.status === 429) throw new Error("Too many requests.");
                throw new Error(data.detail || 'Download failed to start');
            }
            
            const taskId = data.task_id;
            
            // SSE connection
            const eventSource = new EventSource(`/api/progress/${taskId}`);
            
            eventSource.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                
                if (msg.status === 'downloading') {
                    dlStatusDetail.textContent = 'Downloading video chunks...';
                    dlProgressBar.style.width = msg.percent;
                    dlPercent.textContent = msg.percent;
                    dlSpeed.textContent = msg.speed;
                    dlEta.textContent = `ETA: ${msg.eta}`;
                } 
                else if (msg.status === 'processing') {
                    let text = 'Merging video and audio (this may take a moment)...';
                    if (msg.detail) text = msg.detail;
                    dlStatusDetail.textContent = text;
                    dlProgressBar.style.width = '100%';
                    dlPercent.textContent = '99%';
                    dlSpeed.textContent = 'Processing...';
                    dlEta.textContent = '';
                }
                else if (msg.status === 'completed') {
                    eventSource.close();
                    
                    const ext = currentMode === 'mp3' ? 'mp3' : 'mp4';
                    let safeTitle = currentTitle.replace(/[/\\?%*:|"<>]/g, '-');
                    
                    saveFileLink.href = `/api/file/${taskId}?name=${encodeURIComponent(safeTitle)}.${ext}`;
                    saveFileLink.download = ''; 
                    
                    showState(completedState);
                    
                    // Add to recent downloads history
                    saveRecentDownload({
                        title: currentTitle,
                        thumb: previewThumb.src,
                        platform: previewPlatform.textContent,
                        url: currentUrl
                    });
                }
                else if (msg.status === 'error') {
                    eventSource.close();
                    let errMsg = msg.detail || 'Unknown error';
                    if (errMsg.includes('File is larger than max-filesize')) {
                        errMsg = 'File size limit exceeded.';
                    }
                    showError('Download Failed', errMsg);
                }
            };
            
            eventSource.onerror = () => {
                // If it wasn't a clean close by us
                eventSource.close();
            };

        } catch (err) {
            showError("Download Failed", err.message);
        }
    });

    // --- Flow: Playlist Download ---
    
    document.getElementById('playlist-download-btn').addEventListener('click', async () => {
        const checkboxes = document.querySelectorAll('.pl-checkbox:checked');
        if (checkboxes.length === 0) return;
        
        // Hide button, disable tabs
        document.getElementById('playlist-download-btn').classList.add('opacity-50', 'pointer-events-none');
        document.getElementById('playlist-download-btn').textContent = 'Processing...';
        
        // Process them one by one to avoid overwhelming server/rate limits
        for (const cb of checkboxes) {
            const idx = cb.getAttribute('data-idx');
            const item = playlistEntries[idx];
            
            const progBg = document.getElementById(`pl-prog-bg-${idx}`);
            const progBar = document.getElementById(`pl-prog-bar-${idx}`);
            const statusTxt = document.getElementById(`pl-status-${idx}`);
            const actionDiv = document.getElementById(`pl-action-${idx}`);
            
            progBg.classList.remove('hidden');
            statusTxt.classList.remove('hidden');
            statusTxt.textContent = 'Connecting...';
            
            try {
                // Determine format
                // In playlist mode, we just pass null for best quality or 'mp3' for audio
                const format_id = playlistMode === 'mp3' ? 'mp3' : null;
                
                const response = await fetch('/api/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: item.url, format_id: format_id, embed_subs: false })
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.detail || 'Failed');
                }
                
                const taskId = data.task_id;
                
                // Wait for SSE
                await new Promise((resolve, reject) => {
                    const eventSource = new EventSource(`/api/progress/${taskId}`);
                    
                    eventSource.onmessage = (event) => {
                        const msg = JSON.parse(event.data);
                        
                        if (msg.status === 'downloading') {
                            statusTxt.textContent = `Downloading ${msg.percent} (${msg.speed})`;
                            progBar.style.width = msg.percent;
                        } 
                        else if (msg.status === 'processing') {
                            statusTxt.textContent = 'Processing / Merging...';
                            progBar.style.width = '100%';
                        }
                        else if (msg.status === 'completed') {
                            eventSource.close();
                            
                            const ext = playlistMode === 'mp3' ? 'mp3' : 'mp4';
                            let safeTitle = (item.title || 'video').replace(/[/\\?%*:|"<>]/g, '-');
                            
                            statusTxt.textContent = 'Completed!';
                            statusTxt.className = 'text-[10px] text-emerald-500 mt-0.5';
                            
                            actionDiv.innerHTML = `
                                <a href="/api/file/${taskId}?name=${encodeURIComponent(safeTitle)}.${ext}" download class="w-8 h-8 rounded bg-primary-500/10 flex items-center justify-center border border-primary-500/30 hover:bg-primary-500/30 transition-colors" title="Save File">
                                    <i data-lucide="save" class="w-4 h-4 text-primary-400"></i>
                                </a>
                            `;
                            lucide.createIcons();
                            
                            // Add to history
                            saveRecentDownload({
                                title: item.title,
                                thumb: item.thumbnail,
                                platform: 'Playlist Item',
                                url: item.url
                            });
                            
                            resolve();
                        }
                        else if (msg.status === 'error') {
                            eventSource.close();
                            reject(new Error(msg.detail || 'Error'));
                        }
                    };
                    
                    eventSource.onerror = () => {
                        eventSource.close();
                        reject(new Error("Connection lost"));
                    };
                });
                
            } catch (err) {
                statusTxt.textContent = 'Error: ' + err.message;
                statusTxt.className = 'text-[10px] text-red-500 mt-0.5';
            }
        }
        
        document.getElementById('playlist-download-btn').textContent = 'All Done!';
    });

    // --- Flow: Recent Downloads ---
    const recentDownloadsSection = document.getElementById('recent-downloads-section');
    const recentList = document.getElementById('recent-list');

    function loadRecentDownloads() {
        const history = JSON.parse(localStorage.getItem('videoDropHistory') || '[]');
        if (history.length === 0) {
            recentDownloadsSection.classList.add('hidden');
            return;
        }

        recentDownloadsSection.classList.remove('hidden');
        recentDownloadsSection.classList.add('opacity-100');
        recentList.innerHTML = '';

        history.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = "flex items-center gap-4 p-3 bg-surface/50 border border-zinc-800 rounded-xl hover:bg-surface-light hover:border-zinc-700 transition-all cursor-pointer group";
            div.innerHTML = `
                <div class="w-16 h-12 rounded bg-zinc-800 shrink-0 overflow-hidden relative">
                    <img src="${item.thumb}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity">
                    <div class="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
                </div>
                <div class="flex-grow min-w-0">
                    <h4 class="text-sm font-semibold text-zinc-200 truncate group-hover:text-primary-400 transition-colors">${item.title}</h4>
                    <p class="text-xs text-zinc-500 capitalize mt-0.5">${item.platform}</p>
                </div>
                <div class="shrink-0 w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center group-hover:bg-primary-500 group-hover:text-white text-zinc-400 transition-all">
                    <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
                </div>
            `;
            
            div.addEventListener('click', () => {
                urlInput.value = item.url;
                urlInput.focus();
                // trigger submit
                urlForm.dispatchEvent(new Event('submit'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            
            recentList.appendChild(div);
        });
        
        lucide.createIcons();
    }

    function saveRecentDownload(item) {
        let history = JSON.parse(localStorage.getItem('videoDropHistory') || '[]');
        // Remove if exists to put it at the top
        history = history.filter(h => h.url !== item.url);
        
        history.unshift(item); // Add to beginning
        
        // Keep only last 5
        if (history.length > 5) {
            history.pop();
        }
        
        localStorage.setItem('videoDropHistory', JSON.stringify(history));
        loadRecentDownloads();
    }

    // Load history on startup
    loadRecentDownloads();
});
