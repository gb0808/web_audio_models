/*globals define*/

define([
    'js/PanelBase/PanelBaseWithHeader',
    'js/PanelManager/IActivePanel',
    'blob/BlobClient',
    './AudioCodeUtils',
    'css!./AudioPlayerPanel.css'
], function (
    PanelBaseWithHeader,
    IActivePanel,
    BlobClient,
    AudioCodeUtils
) {
    'use strict';

    
    var AudioPlayerPanel;

    // Panel header setup
    AudioPlayerPanel = function (layoutManager, params) {
        var options = {};
        options[PanelBaseWithHeader.OPTIONS.LOGGER_INSTANCE_NAME] = 'AudioPlayerPanel';
        options[PanelBaseWithHeader.OPTIONS.FLOATING_TITLE] = true;

        PanelBaseWithHeader.apply(this, [options, 'Audio Player']);
        IActivePanel.call(this, layoutManager, params);

        params = params || {};
        this._client = params.client;
        this._activeNodeId = params.activeNode;

        this.bc = new BlobClient({ logger: this.logger });
        this.currentDescriptor = null;
        this.raf = null;
        this.audioCtx = null;
        this.audioAsset = null;
        this.mediaSource = null;
        this.analyser = null;
        this.localFileUrl = null;
        this.audioNodes = {};
        this.resumeAudio = null;
        this.userPaused = true;
        this.statusMessage = '';
        this.initialize();
    };

    AudioPlayerPanel.prototype = Object.create(PanelBaseWithHeader.prototype);
    AudioPlayerPanel.prototype.constructor = AudioPlayerPanel;

    // Set up audio player panel structure and HTML
    AudioPlayerPanel.prototype.initialize = function () {
        var self = this;
        var body = this.$el;

        // Setup panel HTML
        body.addClass('audio-player-panel');
        body.append([
            '<div class="controls">',
            '  <input type="file" class="audio-input" accept="audio/*" />',
            '  <button class="btn btn-primary btn-play">Play</button>',
            '  <button class="btn btn-default btn-pause">Pause</button>',
            '  <span class="status"></span>',
            '</div>',
            '<div class="descriptor-loader">',
            '  <select class="descriptor-select form-control">',
            '    <option value="">Select an AudioGraph descriptor</option>',
            '  </select>',
            '  <button class="btn btn-default btn-load-descriptor">Load Descriptor</button>',
            '</div>',
            '<canvas class="waveform" height="180"></canvas>',
            '<div class="code-section">',
            '  <div class="code-header">',
            '    <span>Generated Web Audio code</span>',
            '    <button class="btn btn-xs btn-default btn-copy-code" type="button">Copy</button>',
            '  </div>',
            '  <pre class="code-block"><code class="code-content">// Load a descriptor to see the generated graph code.</code></pre>',
            '</div>'
        ].join(''));

        // UI element references
        this.canvas = body.find('.waveform')[0];
        this.ctx2d = this.canvas.getContext('2d');
        this.statusEl = body.find('.status');
        this.codeContentEl = body.find('.code-content')[0];
        this.status('Select an AudioGraph descriptor or pick a local audio file to begin.');

        // Event bindings
        this.$el.on('click', '.btn-play', function () {
            self.play();
        });
        this.$el.on('click', '.btn-pause', function () {
            self.pause();
        });
        this.$el.on('click', '.btn-load-descriptor', function () {
            var hash = body.find('.descriptor-select').val();
            if (!hash) {
                return;
            }
            self.bc.getObjectAsJSON(hash)
                .then(function (descriptor) {
                    self.onDescriptorLoaded(descriptor, 'Descriptor loaded');
                });
        });
        this.$el.on('change', '.audio-input', function (event) {
            var file = event.target.files && event.target.files[0];
            if (!file) {
                return;
            }
            if (self.localFileUrl) {
                window.URL.revokeObjectURL(self.localFileUrl);
            }
            var url = window.URL.createObjectURL(file);
            self.localFileUrl = url;

            self.status('Loaded local file: ' + file.name);
            self.buildGraph(url);
        });
        this.$el.on('click', '.btn-copy-code', function () {
            self.copyCode();
        });
        this.populateDescriptorDropdown();
    };

    // Walks the AudioStudio and pulls all AudioGraph descriptors hashes for dropdown
    AudioPlayerPanel.prototype.populateDescriptorDropdown = function () {
        var selector = this.$el.find('.descriptor-select');
        selector.empty();
        selector.append('<option value="">Select an AudioGraph descriptor</option>');

        var client = this._client;
        var activeNodeId = this._activeNodeId || WebGMEGlobal.State.getActiveObject();
        this._activeNodeId = activeNodeId;
        if (!client || !activeNodeId) {
            this.status('Active node not found');
            return;
        }
        var activeNode = client.getNode(activeNodeId);
        if (!activeNode || !activeNode.getChildrenIds) {
            this.status('Active node not found');
            return;
        }

        // Walk only AudioGraph children and add hashes to dropdown
        var childIds = activeNode.getChildrenIds();
        childIds.forEach(function (childId) {
            var child = client.getNode(childId);
            if (!child) {
                return;
            }
            var metaNode = client.getNode(child.getMetaTypeId());
            var metaName = metaNode && metaNode.getAttribute && metaNode.getAttribute('name');

            if (metaName === 'AudioGraph') {
                var hash = child.getAttribute('graphDescriptorFileHash');
                if (hash) {
                    var name = child.getAttribute('name') || childId;
                    selector.append('<option value="' + hash + '">' + name + '</option>');
                }
            }
        });
    };


    // Handle descriptor once fetched.
    AudioPlayerPanel.prototype.onDescriptorLoaded = function (descriptor) {
        this.currentDescriptor = descriptor;
        this.status('Descriptor loaded');
        var self = this;
        var urlToUse = this.localFileUrl;

        // Generates boilerplate code for audio graph
        this.renderGraphCode(descriptor, urlToUse);

        if (urlToUse) {
            self.buildGraph(urlToUse);
        } else {
            this.status('Descriptor loaded. Use the file picker to attach audio.');
        }
    };

    // Build Web Audio graph from descriptor or fallback.
    AudioPlayerPanel.prototype.buildGraph = function (audioUrl) {
        var descriptor = this.currentDescriptor;

        if (!audioUrl) {
            this.status('No audio source loaded.');
            return;
        }

        var self = this;
        this.audioCtx = new window.AudioContext();
        this.audioAsset = new Audio();
        this.audioAsset.src = audioUrl;
        this.mediaSource = this.audioCtx.createMediaElementSource(this.audioAsset);
        this.analyser = this.audioCtx.createAnalyser();
        this.audioNodes = {};
        this.userPaused = true;

        // Just play the original audio if no descriptor
        if (!descriptor) {
            this.status('No descriptor loaded, playing original audio.');
            this.mediaSource.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);
            this.drawWaveform();
            return;
        }

        var descriptorNodes = descriptor.nodes;

        // Walk through descriptor and create Web Audio nodes
        Object.keys(descriptorNodes).forEach(path => {
            var node = descriptorNodes[path];
            var type = node.type;
            var attrs = node.attrs || {};

            console.log(type);

            if (type === 'AudioDestinationNode') {
                self.audioNodes[path] = self.analyser;
            } else if (type === 'MediaElementSourceNode') {
                self.audioNodes[path] = self.mediaSource;
            } else if (type === 'GainNode') {
                var gainNode = self.audioCtx.createGain();
                if (attrs.gain !== undefined) {
                    gainNode.gain.value = attrs.gain;
                }
                self.audioNodes[path] = gainNode;
            } else if (type === 'WaveShaperNode') {
                self.audioNodes[path] = self.audioCtx.createWaveShaper();
                self.audioNodes[path].curve = self.createWaveShaperCurve(attrs.amount);
                if (attrs.oversample && ['none', '2x', '4x'].indexOf(attrs.oversample) !== -1) {
                    self.audioNodes[path].oversample = attrs.oversample;
                }
            } else if (type === 'DelayNode') {
                var delayNode = self.audioCtx.createDelay(1.0) // max delay time in sec
                if (attrs.delayTime !== undefined) {
                    delayNode.delayTime.value = attrs.delayTime;
                }
                self.audioNodes[path] = delayNode;
            } else if (type === 'BiquadFilterNode') {
                var biquadFilterNode = self.audioCtx.createBiquadFilter();
                if (attrs.type !== undefined) {
                    biquadFilterNode.type = attrs.type;
                }
                if (attrs.Q !== undefined) {
                    biquadFilterNode.Q.value = attrs.Q;
                } 
                if (attrs.frequency !== undefined) {
                    biquadFilterNode.frequency.value = attrs.frequency;
                }
                if (attrs.gain !== undefined) {
                    biquadFilterNode.gain.value = attrs.gain;
                }
                self.audioNodes[path] = biquadFilterNode;
            } else if (type === 'StereoPannerNode') {
                var stereoPannerNode = self.audioCtx.createStereoPanner();
                if (attrs.pan !== undefined) {
                    stereoPannerNode.pan.value = attrs.pan;
                }
                self.audioNodes[path] = stereoPannerNode;
            } else if (type === 'OscillatorNode') {
                var oscillatorNode = self.audioCtx.createOscillator();
                if (attrs.type !== undefined) {
                    oscillatorNode.type = attrs.type;
                }
                if (attrs.frequency !== undefined) {
                    oscillatorNode.frequency.value = attrs.frequency;
                }
                if (attrs.detune !== undefined) {
                    oscillatorNode.detune.value = attrs.detune;
                }
                self.audioNode[path] = oscillatorNode;
            }
        });

        // Connect graph using descriptor connections
        (descriptor.connections).forEach(c => {
            var srcNode = self.audioNodes[c.src] || self.mediaSource;
            var dstNode = self.audioNodes[c.dst] || self.analyser;
            srcNode.connect(dstNode);
        });

        this.analyser.connect(this.audioCtx.destination);
        this.status('Audio graph created. Press play.');
        this.drawWaveform();
    };

    AudioPlayerPanel.prototype.renderGraphCode = function (descriptor, audioUrl) {
        if (!this.codeContentEl) {
            return;
        }
        var code = AudioCodeUtils.generateGraphBoilerplate(descriptor, audioUrl);
        this.codeContentEl.textContent = code;
    };

    // Audio waveform rendering
    AudioPlayerPanel.prototype.drawWaveform = function () {
        var self = this;
        var buffer = new Uint8Array(2048);
        var width = this.canvas.width;
        var height = this.canvas.height;

        function draw() {
            self.raf = window.requestAnimationFrame(draw);
            self.analyser.getByteTimeDomainData(buffer);

            self.ctx2d.clearRect(0, 0, width, height);
            self.ctx2d.beginPath();

            var slice = width / buffer.length;
            for (var i = 0; i < buffer.length; i += 1) {
                var x = i * slice;
                var v = buffer[i] / 255;
                var y = v * height;
                if (i === 0) {
                    self.ctx2d.moveTo(x, y);
                } else {
                    self.ctx2d.lineTo(x, y);
                }
            }
            self.ctx2d.strokeStyle = '#f50606ff';
            self.ctx2d.lineWidth = 2;
            self.ctx2d.stroke();
        }
        draw();
    };

    // Wave curve creation for WaveShaperNode
    AudioPlayerPanel.prototype.createWaveShaperCurve = function (amount) {
        var k = Math.max(0, typeof amount === 'number' ? amount : parseFloat(amount) || 0);
        var samples = 44100;
        var curve = new Float32Array(samples);

        for (var i = 0; i < samples; i += 1) {
            var x = i * 2 / samples - 1;
            if (k === 0) {
                curve[i] = x;
            } else {
                curve[i] = ((k + 1) * x) / (1 + k * Math.abs(x));
            }
        }
        return curve;
    };

    AudioPlayerPanel.prototype.copyCode = function () {
        if (!this.codeContentEl) {
            return;
        }
        AudioCodeUtils.copyCode(this.codeContentEl, this.status.bind(this));
    };

    // Play button controls
    AudioPlayerPanel.prototype.play = function () {
        if (!this.audioAsset) {
            this.status('Load an audio file first.');
            return;
        }

        this.status('Playing...');
        this.userPaused = false;
        var play = () => this.audioAsset.play();

        // Resume suspended context, otherwise play directly
        var playPromise = (this.audioCtx && this.audioCtx.state === 'suspended')
            ? this.audioCtx.resume().then(play)
            : play();
    };

    // Pause button controls
    AudioPlayerPanel.prototype.pause = function () {
        this.userPaused = true;
        if (this.audioAsset) {
            this.audioAsset.pause();
            this.status('Paused.');
        }
    };

    // Update status message
    AudioPlayerPanel.prototype.status = function (text) {
        this.statusMessage = text;
        if (!this.statusEl) {
            return;
        }
        var combined = this.statusMessage || '';
        this.statusEl.text(combined);
    };

    // Prevents toolbar for split panel error
    AudioPlayerPanel.prototype.getSplitPanelToolbarEl = function () {
        return null;
    };

    return AudioPlayerPanel;
});
