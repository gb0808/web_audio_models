/*globals define*/

define([], function () {

    function generateGraphBoilerplate(descriptor, audioUrl) {
        if (!descriptor) {
            return '// Load a descriptor to see the generated graph code.';
        }

        var nodes = descriptor.nodes;
        var connections = descriptor.connections;
        var nodePaths = Object.keys(nodes);
        var nameMap = {};
        var needsWaveShaperCurve = false;
        var counter = 1;

        // TODO: Add support for other node types
        nodePaths.forEach(function (path) {
            var type = nodes[path] && nodes[path].type;
            if (type === 'MediaElementSourceNode') {
                nameMap[path] = 'mediaSource';
            } else if (type === 'AudioDestinationNode') {
                nameMap[path] = 'analyser';
            } else {
                nameMap[path] = 'node' + counter;
                counter += 1;
            }

            if (type === 'WaveShaperNode') {
                needsWaveShaperCurve = true;
            }
        });

        var lines = [];

        lines.push('// Auto-generated Web Audio boilerplate from descriptor');
        lines.push('const audioCtx = new window.AudioContext();');
        lines.push('const audioElement = new Audio(<AudioURLHere>);');
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
        lines.push('const nodes = {};');
        lines.push('const connect = (from, to) => { if (from && to && from.connect) { from.connect(to); } };');
        lines.push('');
        nodePaths.forEach(function (path) {
            var node = nodes[path] || {};
            var type = node.type;
            var attrs = node.attrs || {};
            var name = nameMap[path];

            if (type === 'MediaElementSourceNode') {
                lines.push('nodes[' + JSON.stringify(path) + '] = mediaSource;');
                return;
            }

            if (type === 'AudioDestinationNode') {
                lines.push('nodes[' + JSON.stringify(path) + '] = analyser;');
                return;
            }

            if (type === 'GainNode') {
                lines.push('const ' + name + ' = audioCtx.createGain(); // ' + path + ' GainNode');
                if (attrs.gain !== undefined) {
                    lines.push(name + '.gain.value = ' + JSON.stringify(attrs.gain) + ';');
                }
                lines.push('nodes[' + JSON.stringify(path) + '] = ' + name + ';');
                return;
            }

            if (type === 'WaveShaperNode') {
                lines.push('const ' + name + ' = audioCtx.createWaveShaper(); // ' + path + ' WaveShaperNode');
                if (attrs.amount !== undefined) {
                    lines.push(name + '.curve = createWaveShaperCurve(' + JSON.stringify(attrs.amount) + ');');
                }
                if (attrs.oversample) {
                    lines.push(name + '.oversample = ' + JSON.stringify(attrs.oversample) + ';');
                }
                lines.push('nodes[' + JSON.stringify(path) + '] = ' + name + ';');
                return;
            }
        });

        lines.push('');
        lines.push('// Wire up graph');
        connections.forEach(function (conn) {
            lines.push('connect(' + nameMap[conn.src] + ', ' + nameMap[conn.dst] + ');');
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
