/**
 * Recorder Page Logic
 * Handles recording workflow: story selection → record → playback → submit → next sentence
 */

class RecorderApp {
    constructor() {
        this.storyId = null;
        this.userId = null;
        this.currentSentence = null;
        this.allSentences = []; // Store all sentences for navigation
        this.currentIndex = 0; // Current position in allSentences array
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordedBlob = null;
        this.audioStream = null;
        this.audioContext = null;
        this.analyser = null;
        this.visualizerAnimationId = null;
        
        this.initElements();
        this.initUserId();
        this.displayUserEmail();
        this.loadStoryId();
    }
    
    initElements() {
        // UI elements
        this.loadingEl = document.getElementById('loading');
        this.recorderSection = document.getElementById('recorder-section');
        this.completionSection = document.getElementById('completion-section');
        this.errorSection = document.getElementById('error-section');
        this.errorMessage = document.getElementById('error-message');
        this.errorRetryBtn = document.getElementById('error-retry-btn');
        this.errorBackLink = document.getElementById('error-back-link');
        this.statusMessage = document.getElementById('status-message');
        
        // Sentence display
        this.storyTitleEl = document.getElementById('story-title');
        this.progressText = document.getElementById('progress-text');
        this.remainingText = document.getElementById('remaining-text');
        this.sentenceDevanagari = document.getElementById('sentence-devanagari');
        this.sentenceIast = document.getElementById('sentence-iast');
        this.recordingIndicator = document.getElementById('recording-indicator');
        
        // Buttons
        this.btnRecord = document.getElementById('btn-record');
        this.btnStop = document.getElementById('btn-stop');
        this.btnPlay = document.getElementById('btn-play');
        this.btnRerecord = document.getElementById('btn-rerecord');
        this.btnSubmit = document.getElementById('btn-submit');
        this.btnEnd = document.getElementById('btn-end');
        this.btnPrevious = document.getElementById('btn-previous');
        this.btnNext = document.getElementById('btn-next');
        
        // Visualizer
        this.visualizerCanvas = document.getElementById('visualizer');
        this.visualizerCtx = this.visualizerCanvas.getContext('2d');
        
        // Event listeners
        this.btnRecord.addEventListener('click', () => this.startRecording());
        this.btnStop.addEventListener('click', () => this.stopRecording());
        this.btnPlay.addEventListener('click', () => this.playRecording());
        this.btnRerecord.addEventListener('click', () => this.rerecord());
        this.btnSubmit.addEventListener('click', () => this.submitRecording());
        this.btnEnd.addEventListener('click', () => this.endSession());
        this.btnPrevious.addEventListener('click', () => this.navigatePrevious());
        this.btnNext.addEventListener('click', () => this.navigateNext());
        if (this.errorRetryBtn) this.errorRetryBtn.addEventListener('click', () => this.handleErrorRetry());
    }
    
    initUserId() {
        // Get user email from session (set on home page)
        this.userId = sessionStorage.getItem('userEmail');
        
        if (!this.userId) {
            // Redirect to home page if no email found
            alert('Please enter your email on the home page first.');
            window.location.href = '/';
            return;
        }
        
        // Ensure email is lowercase
        this.userId = this.userId.toLowerCase().trim();
        sessionStorage.setItem('userEmail', this.userId);
    }
    
    displayUserEmail() {
        const emailDisplay = document.getElementById('user-email-recorder');
        if (emailDisplay && this.userId) {
            emailDisplay.textContent = `📧 ${this.userId}`;
        }
    }
    
    loadStoryId() {
        this.storyId = sessionStorage.getItem('selectedStoryId');
        if (!this.storyId) {
            this.showError('No story selected. Please select a story from the home page.');
            return;
        }
        
        this.loadAllSentences();
    }
    
    async loadAllSentences() {
        try {
            this.showStatus('Loading sentences...', 'info');
            
            const response = await fetch(`/api/sentences/${this.storyId}/all?userId=${encodeURIComponent(this.userId)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            this.allSentences = await response.json();
            
            if (this.allSentences.length === 0) {
                this.showError('No sentences found for this story.');
                return;
            }
            
            // Start at first unrecorded sentence, or first sentence if all recorded
            this.currentIndex = this.allSentences.findIndex(s => !s.has_recording);
            if (this.currentIndex === -1) {
                this.currentIndex = 0; // All recorded, start at beginning
            }
            
            this.loadSentenceAtIndex(this.currentIndex);
            
        } catch (error) {
            console.error('Failed to load sentences:', error);
            this.showError('Failed to load sentences. Please try again.');
        }
    }
    
    loadSentenceAtIndex(index) {
        if (index < 0 || index >= this.allSentences.length) {
            return;
        }
        
        this.currentIndex = index;
        const sentence = this.allSentences[index];
        
        // Fetch story title (we'll get it from the first API call)
        fetch(`/api/stories`)
            .then(res => res.json())
            .then(stories => {
                const story = stories.find(s => s.id === parseInt(this.storyId));
                this.currentSentence = {
                    sentence_id: sentence.id,
                    text_devanagari: sentence.text_devanagari,
                    text_iast: sentence.text_iast,
                    story_title: story ? story.title : 'Recording',
                    order: sentence.order_in_story,
                    total: this.allSentences.length,
                    remaining: this.allSentences.filter(s => !s.has_recording).length,
                    has_recording: sentence.has_recording,
                    recording_id: sentence.recording_id
                };
                this.displaySentence();
            })
            .catch(() => {
                this.currentSentence = {
                    sentence_id: sentence.id,
                    text_devanagari: sentence.text_devanagari,
                    text_iast: sentence.text_iast,
                    story_title: 'Recording',
                    order: sentence.order_in_story,
                    total: this.allSentences.length,
                    remaining: this.allSentences.filter(s => !s.has_recording).length,
                    has_recording: sentence.has_recording,
                    recording_id: sentence.recording_id
                };
                this.displaySentence();
            });
    }
    
    navigatePrevious() {
        if (this.currentIndex > 0) {
            this.loadSentenceAtIndex(this.currentIndex - 1);
        }
    }
    
    navigateNext() {
        if (this.currentIndex < this.allSentences.length - 1) {
            this.loadSentenceAtIndex(this.currentIndex + 1);
        }
    }
    
    async loadNextSentence() {
        // Legacy method - now just navigate to next unrecorded
        const nextUnrecorded = this.allSentences.findIndex((s, idx) => idx > this.currentIndex && !s.has_recording);
        if (nextUnrecorded !== -1) {
            this.loadSentenceAtIndex(nextUnrecorded);
        } else {
            // Check if all done
            if (this.allSentences.every(s => s.has_recording)) {
                this.showCompletion();
            } else {
                // Loop back to first unrecorded
                const firstUnrecorded = this.allSentences.findIndex(s => !s.has_recording);
                if (firstUnrecorded !== -1) {
                    this.loadSentenceAtIndex(firstUnrecorded);
                } else {
                    this.showCompletion();
                }
            }
        }
    }
    
    displaySentence() {
        this.loadingEl.style.display = 'none';
        this.recorderSection.style.display = 'block';
        
        this.storyTitleEl.textContent = this.currentSentence.story_title || 'Recording';
        this.sentenceDevanagari.textContent = this.currentSentence.text_devanagari;
        this.sentenceIast.textContent = this.currentSentence.text_iast || '';
        
        const currentNum = this.currentSentence.order;
        const total = this.currentSentence.total;
        const remaining = this.currentSentence.remaining;
        
        this.progressText.textContent = `Sentence ${currentNum} of ${total}`;
        this.remainingText.textContent = `${remaining} remaining`;
        
        // Update navigation button states
        this.btnPrevious.disabled = this.currentIndex === 0;
        this.btnNext.disabled = this.currentIndex === this.allSentences.length - 1;
        
        // Reset recording state
        this.resetRecordingState();
        
        // Set initial status message based on whether sentence has recording
        if (this.currentSentence.has_recording) {
            this.showStatus('Recording saved successfully!', 'success');
        } else {
            this.showStatus('To be recorded', 'info');
        }
        
        // If sentence already has recording, enable play button (highlighted)
        if (this.currentSentence.has_recording) {
            this.btnPlay.disabled = false;
            this.btnPlay.style.opacity = '1';
            this.btnPlay.title = 'Play existing recording';
        } else {
            this.btnPlay.style.opacity = '0.5';
            this.btnPlay.title = 'No recording yet';
        }
    }
    
    resetRecordingState() {
        this.recordedBlob = null;
        this.audioChunks = [];
        
        this.btnRecord.disabled = false;
        this.btnStop.disabled = true;
        this.btnPlay.disabled = true;
        this.btnRerecord.disabled = true;
        this.btnSubmit.disabled = true;
        this.btnSubmit.textContent = '✓ Submit & Next';
        
        this.recordingIndicator.classList.remove('active');
        this.btnRecord.classList.remove('recording');
        
        this.clearVisualizer();
        
        // Update Record button text based on whether sentence has existing recording
        if (this.currentSentence && this.currentSentence.has_recording) {
            this.btnRecord.textContent = '🎙️ Re-record';
            this.btnPlay.disabled = false;
            this.btnPlay.style.opacity = '1';
        } else {
            this.btnRecord.textContent = '🎙️ Record';
            this.btnPlay.style.opacity = '0.5';
        }
    }
    
    async startRecording() {
        try {
            // Request microphone access
            this.audioStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            
            // Setup audio context for visualization
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(this.audioStream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            source.connect(this.analyser);
            
            // Start visualization
            this.visualize();
            
            // Setup MediaRecorder
            const options = { mimeType: 'audio/webm;codecs=opus' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'audio/webm';
            }
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = '';
            }
            
            this.mediaRecorder = new MediaRecorder(this.audioStream, options);
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.recordedBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.onRecordingComplete();
            };
            
            // Start recording
            this.audioChunks = [];
            this.mediaRecorder.start();
            
            // Update UI
            this.btnRecord.disabled = true;
            this.btnStop.disabled = false;
            this.btnRecord.classList.add('recording');
            this.recordingIndicator.classList.add('active');
            
            this.showStatus('Recording... Speak now!', 'info');
            
        } catch (error) {
            console.error('Failed to start recording:', error);
            this.showError('Failed to access microphone. Please allow microphone access and try again.');
            this.stopMediaStream();
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        this.stopMediaStream();
        
        // Update UI
        this.btnStop.disabled = true;
        this.btnRecord.classList.remove('recording');
        this.recordingIndicator.classList.remove('active');
        
        if (this.visualizerAnimationId) {
            cancelAnimationFrame(this.visualizerAnimationId);
            this.visualizerAnimationId = null;
        }
    }
    
    stopMediaStream() {
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
    
    onRecordingComplete() {
        console.debug('onRecordingComplete: audioChunks length=', this.audioChunks.length, 'blob size=', this.recordedBlob ? this.recordedBlob.size : 0);
        this.btnPlay.disabled = false;
        this.btnPlay.style.opacity = '1'; // Highlight play button
        this.btnRerecord.disabled = false;
        this.btnSubmit.disabled = false;
        
        // Update Record button to say Re-record and enable it
        this.btnRecord.disabled = false;
        this.btnRecord.textContent = '🎙️ Re-record';
        
        this.showStatus('Recording complete! You can play it back, re-record, or submit.', 'success');
    }
    
    async playRecording() {
        let audioUrl;
        
        // If there's a newly recorded blob, play that
        if (this.recordedBlob) {
            console.log('Playing newly recorded blob, size:', this.recordedBlob.size);
            audioUrl = URL.createObjectURL(this.recordedBlob);
        } 
        // Otherwise, if sentence has existing recording, fetch and play it
        else if (this.currentSentence.has_recording && this.currentSentence.recording_id) {
            try {
                this.btnPlay.textContent = '⏳ Loading...';
                this.btnPlay.disabled = true;
                
                console.log('Fetching recording:', this.currentSentence.recording_id);
                const response = await fetch(`/api/recordings/${this.currentSentence.recording_id}/audio`);
                if (!response.ok) {
                    this.showStatus('Failed to load existing recording', 'error');
                    this.btnPlay.textContent = '▶️ Play';
                    this.btnPlay.disabled = false;
                    return;
                }
                const blob = await response.blob();
                console.log('Received blob, size:', blob.size, 'type:', blob.type);
                audioUrl = URL.createObjectURL(blob);
            } catch (error) {
                console.error('Error loading existing recording:', error);
                this.showStatus('Failed to load existing recording', 'error');
                this.btnPlay.textContent = '▶️ Play';
                this.btnPlay.disabled = false;
                return;
            }
        } else {
            return;
        }
        
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = audioUrl;
        
        console.log('Audio element created, src:', audioUrl);
        
        this.btnPlay.textContent = '⏸️ Playing...';
        this.btnPlay.disabled = true;
        
        // Use loadeddata instead of canplaythrough for more reliable playback
        audio.addEventListener('loadeddata', () => {
            console.log('Audio loaded, duration:', audio.duration, 'seconds');
            audio.play().catch(err => {
                console.error('Play error:', err);
                this.btnPlay.textContent = '▶️ Play';
                this.btnPlay.disabled = false;
                URL.revokeObjectURL(audioUrl);
            });
        }, { once: true });
        
        audio.addEventListener('ended', () => {
            console.log('Audio playback ended');
            this.btnPlay.textContent = '▶️ Play';
            this.btnPlay.disabled = false;
            URL.revokeObjectURL(audioUrl);
        });
        
        audio.addEventListener('error', (e) => {
            console.error('Audio error:', e, 'Error code:', audio.error ? audio.error.code : 'unknown');
            this.btnPlay.textContent = '▶️ Play';
            this.btnPlay.disabled = false;
            URL.revokeObjectURL(audioUrl);
            this.showStatus('Error playing audio', 'error');
        });
        
        audio.addEventListener('pause', () => {
            console.log('Audio paused at:', audio.currentTime, '/', audio.duration);
        });
        
        // Start loading the audio
        audio.load();
    }
    
    rerecord() {
        if (this.errorSection) this.errorSection.style.display = 'none';
        this.resetRecordingState();
        this.hideStatus();
    }
    
    async submitRecording() {
        console.debug('submitRecording called');
        if (!this.recordedBlob || !this.currentSentence) return;
        
        try {
            this.btnSubmit.disabled = true;
            this.btnSubmit.textContent = '⏳ Uploading...';
            console.debug('submitRecording: preparing formData');
            this.showStatus('Uploading recording...', 'info');
            
            // If re-recording an existing recording, delete the old one first
            if (this.currentSentence.has_recording && this.currentSentence.recording_id) {
                console.debug('Deleting old recording:', this.currentSentence.recording_id);
                try {
                    await fetch(`/api/recordings/${this.currentSentence.recording_id}`, {
                        method: 'DELETE'
                    });
                } catch (err) {
                    console.warn('Failed to delete old recording, continuing anyway:', err);
                }
            }
            
            // Create form data
            const formData = new FormData();
            formData.append('audio', this.recordedBlob, 'recording.webm');
            formData.append('sentence_id', this.currentSentence.sentence_id);
            formData.append('user_id', this.userId);
            
            // Upload
            // Debug: print FormData entries (can't directly stringify FormData)
            for (const pair of formData.entries()) {
                console.debug('FormData entry', pair[0], pair[1] instanceof Blob ? `[Blob ${pair[1].size} bytes]` : pair[1]);
            }
            console.debug('submitRecording: sending XHR to /api/recordings');
            const result = await this.uploadFormDataWithProgress(formData, ({ loaded, total }) => {
                if (total > 0) {
                    const pct = Math.round((loaded / total) * 100);
                    this.showStatus(`Uploading: ${pct}%`, 'info');
                    this.btnSubmit.textContent = `⏳ Uploading ${pct}%`;
                } else {
                    this.showStatus('Uploading... (unable to compute size)', 'info');
                }
            });
            console.debug('submitRecording: upload finished', result);
            
            if (result.status === 'warning') {
                this.showStatus('⚠️ Recording saved but failed validation', 'warning');
                console.warn('Validation errors:', result.validation && result.validation.errors);
            } else {
                this.showStatus('✓ Recording saved successfully!', 'success');
            }
            
            // Update local state - mark sentence as recorded
            this.allSentences[this.currentIndex].has_recording = true;
            this.allSentences[this.currentIndex].recording_id = result.recording_id;
            
            // Wait a moment, then load next sentence
            setTimeout(() => {
                this.loadNextSentence();
            }, 1000);
            
        } catch (error) {
            console.error('Failed to submit recording:', error);
            // Handle validation errors from server (HTTP 422)
            if (error && error.status === 422 && error.body && error.body.validation) {
                // Show user-friendly message with actual validation errors
                const validationErrors = error.body.validation.errors || [];
                console.error('Validation errors:', validationErrors);
                this.showValidationError(validationErrors);
                this.btnSubmit.disabled = false;
                this.btnSubmit.textContent = '✓ Submit & Next';
                return; // do not proceed to next
            }
            this.showError('Failed to upload recording. Please try again.');
            this.btnSubmit.disabled = false;
            this.btnSubmit.textContent = '✓ Submit & Next';
        }
    }

    uploadFormDataWithProgress(formData, onProgress) {
        return new Promise((resolve, reject) => {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/recordings');
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const resJson = JSON.parse(xhr.responseText);
                            resolve(resJson);
                        } catch (e) {
                            reject(new Error('Invalid JSON response'));
                        }
                    } else {
                        try {
                            const body = JSON.parse(xhr.responseText);
                            const err = new Error(body.error || `HTTP ${xhr.status}`);
                            err.status = xhr.status;
                            err.body = body;
                            reject(err);
                        } catch (e) {
                            const err = new Error(`HTTP ${xhr.status}`);
                            err.status = xhr.status;
                            reject(err);
                        }
                    }
                };
                xhr.onerror = () => reject(new Error('Network error while uploading'));
                if (xhr.upload && onProgress) {
                    xhr.upload.onprogress = (event) => {
                        onProgress({ loaded: event.loaded, total: event.total });
                    };
                }
                xhr.send(formData);
            } catch (err) {
                reject(err);
            }
        });
    }
    
    visualize() {
        if (!this.analyser) return;
        
        const canvas = this.visualizerCanvas;
        const ctx = this.visualizerCtx;
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = canvas.offsetHeight;
        
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const draw = () => {
            this.visualizerAnimationId = requestAnimationFrame(draw);
            
            this.analyser.getByteTimeDomainData(dataArray);
            
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(0, 0, width, height);
            
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#16a34a';
            ctx.beginPath();
            
            const sliceWidth = width / bufferLength;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * height / 2;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
                
                x += sliceWidth;
            }
            
            ctx.lineTo(width, height / 2);
            ctx.stroke();
        };
        
        draw();
    }
    
    clearVisualizer() {
        const canvas = this.visualizerCanvas;
        const ctx = this.visualizerCtx;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    showStatus(message, type = 'info') {
        this.statusMessage.textContent = message;
        this.statusMessage.className = 'status-message status-' + type;
        this.statusMessage.style.display = 'block';
    }
    
    hideStatus() {
        this.statusMessage.style.display = 'none';
    }
    
    showCompletion() {
        this.recorderSection.style.display = 'none';
        this.completionSection.style.display = 'block';
    }
    
    showError(message) {
        this.loadingEl.style.display = 'none';
        this.recorderSection.style.display = 'none';
        this.errorSection.style.display = 'block';
        this.errorMessage.textContent = message;
        // Show both Retry and Back buttons for general errors
        if (this.errorBackLink) this.errorBackLink.style.display = 'inline-block';
        if (this.errorRetryBtn) this.errorRetryBtn.style.display = 'inline-block';
    }

    showValidationError(errors = []) {
        let msg = 'Recording validation failed:\n\n';
        if (errors && errors.length > 0) {
            msg += errors.map(e => `• ${e}`).join('\n');
            msg += '\n\nPlease record again.';
        } else {
            msg = 'Hmm. It seems like the recording was either too short or too long for the sentence it was meant for. Would you mind recording again?';
        }
        this.loadingEl.style.display = 'none';
        this.recorderSection.style.display = 'none';
        this.errorSection.style.display = 'block';
        this.errorMessage.textContent = msg;
        // For validation error, show only a Retry button
        if (this.errorBackLink) this.errorBackLink.style.display = 'none';
        if (this.errorRetryBtn) this.errorRetryBtn.style.display = 'inline-block';
    }

    handleErrorRetry() {
        // Hide error and go back to recording UI with re-record state
        this.errorSection.style.display = 'none';
        this.recorderSection.style.display = 'block';
        this.rerecord();
    }
    
    endSession() {
        if (confirm('Are you sure you want to end this recording session?')) {
            window.location.href = 'index.html';
        }
    }
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
    new RecorderApp();
});
