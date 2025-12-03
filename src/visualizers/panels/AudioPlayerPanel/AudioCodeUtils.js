/*globals define*/

define([], function () {

    function generateGraphBoilerplate(descriptor, audioUrl) {
        if (!descriptor) {
            return '// Load a descriptor to see the generated graph code.';
        }

        var nodes = descriptor.nodes;
        var connections = descriptor.connections;
        var nodePaths = Object.keys(nodes);
        var needsWaveShaperCurve = nodePaths.some(function (path) {
            return nodes[path] && nodes[path].type === 'WaveShaperNode';
        });
        var nameMap = {};
        var counter = 1;

        var lines = [];

        lines.push('// Auto-generated Web Audio boilerplate from descriptor');
        lines.push('const audioCtx = new window.AudioContext();');
        lines.push('const audioElement = new Audio(<AUDIO_ASSET_URL>);');
        lines.push('const mediaSource = audioCtx.createMediaElementSource(audioElement);');
        lines.push('const analyser = audioCtx.createAnalyser();');

        if (needsWaveShaperCurve) {
            lines.push('');
            lines.push('function createWaveShaperCurve(amount) {');
            lines.push('  const k = Math.max(0, typeof amount === "number" ? amount : parseFloat(amount) || 0);');
            lines.push('  const samples = 44100;');
            lines.push('  const curve = new Float32Array(samples);');
            lines.push('  for (let i = 0; i < samples; i += 1) {');
            lines.push('    const x = i * 2 / samples - 1;');
            lines.push('    curve[i] = k === 0 ? x : ((k + 1) * x) / (1 + k * Math.abs(x));');
            lines.push('  }');
            lines.push('  return curve;');
            lines.push('}');
        }

        lines.push('');
        lines.push('const connect = (from, to) => { if (from && to && from.connect) { from.connect(to); } };');
        lines.push('');
        nodePaths.forEach(function (path) {
            var node = nodes[path] || {};
            var type = node.type;
            var attrs = node.attrs || {};
            var name = 'node' + counter;
            nameMap[path] = name;
            counter += 1;

            if (type === 'MediaElementSourceNode') {
                lines.push('const ' + name + ' = mediaSource; // MediaElementSourceNode');
                return;
            }

            if (type === 'AudioDestinationNode') {
                lines.push('const ' + name + ' = analyser; // AudioDestinationNode');
                return;
            }

            if (type === 'GainNode') {
                lines.push('const ' + name + ' = audioCtx.createGain(); // GainNode');
                if (attrs.gain !== undefined) {
                    lines.push(name + '.gain.value = ' + JSON.stringify(attrs.gain) + ';');
                }
                return;
            }

            if (type === 'WaveShaperNode') {
                lines.push('const ' + name + ' = audioCtx.createWaveShaper(); // WaveShaperNode');
                if (attrs.amount !== undefined) {
                    lines.push(name + '.curve = createWaveShaperCurve(' + JSON.stringify(attrs.amount) + ');');
                }
                if (attrs.oversample) {
                    lines.push(name + '.oversample = ' + JSON.stringify(attrs.oversample) + ';');
                }
                return;
            }

            // TODO add missing nodes

            if (type === 'DelayNode') {
                lines.push('const ' + name + ' = audioCtx.createDelayNode(1.0); // Delay node with max delay');
                if (attrs.delayTime !== undefined) {
                    lines.push(name + '.delayTime.value = ' + JSON.stringify(attrs.delayTime) + ';')
                }
                return;
            }

            if (type === 'BiquadFilterNode') {
                lines.push('const ' + name + ' = audioCtx.createBiquadFilter(); // BiquadFilter');
                if (attrs.type !== undefined) {
                    lines.push(name + '.type = ' + JSON.stringify(attrs.type) + ';');
                }
                if (attrs.Q !== undefined) {
                    lines.push(name + '.Q.value = ' + JSON.stringify(attrs.Q) + ';');
                } 
                if (attrs.frequency !== undefined) {
                    lines.push(name + '.frequency.value = ' + JSON.stringify(attrs.frequency) + ';');
                }
                if (attrs.gain !== undefined) {
                    lines.push(name + '.gain.value = ' + JSON.stringify(attrs.gain) + ';');
                }
                return;
            }

            if (type === 'StereoPannerNode') {
                lines.push('const ' + name + ' = audioCtx.createStereoPanner(); // StereoPanner');
                if (attrs.pan !== undefined) {
                    lines.push(name + '.pan.valye = ' + JSON.stringify(attrs.pan));
                }
                return;
            }

            if (type === 'OscillatorNode') {
                lines.push('const ' + name + ' = audioCtx.createOscillator(); // Oscillator');
                if (attrs.type !== undefined) {
                    lines.push(name + '.type = ' + JSON.stringify(attrs.type) + ';');
                }
                if (attrs.frequency !== undefined) {
                    lines.push(name + '.frequency.value = ' + JSON.stringify(attrs.frequency) + ';');
                }
                if (attrs.detune !== undefined) {
                    lines.push(name + '.detune.value = ' + JSON.stringify(attrs.detune) + ';');
                }
                lines.push(name + '.start(audioCtx.currentTime);');
                return;
            }
        });

        lines.push('');
        lines.push('// Wire up graph');
        connections.forEach(function (conn) {
            var srcRef = nameMap[conn.src] || 'mediaSource';
            var dstRef = nameMap[conn.dst] || 'analyser';
            lines.push('connect(' + srcRef + ', ' + dstRef + ');');
        });
        lines.push('connect(analyser, audioCtx.destination);');
        lines.push('audioElement.play();');

        return lines.join('\n');
    }

    function copyCode(codeContentEl, onStatus) {
        var code = codeContentEl.textContent;
        navigator.clipboard.writeText(code)
            .then(function () {
                if (onStatus) {
                    onStatus('Graph code copied to clipboard.');
                }
            })
   
    }

    return {
        generateGraphBoilerplate: generateGraphBoilerplate,
        copyCode: copyCode,
    };
});
