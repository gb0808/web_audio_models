/*globals define*/
/*eslint-env node, browser*/

/**
 * Creates a json descriptor of the given AudioGraph nodes and connections
 * and stores it in blob storage.   
 */

define([
    'plugin/PluginConfig',
    'text!./metadata.json',
    'plugin/PluginBase',
    'blob/BlobClient'
], function (
    PluginConfig,
    pluginMetadata,
    PluginBase) {
    'use strict';

    pluginMetadata = JSON.parse(pluginMetadata);

    /**
     * Initializes a new instance of audioGraphToJson.
     * @class
     * @augments {PluginBase}
     * @classdesc This class represents the plugin audioGraphToJson.
     * @constructor
     */
    function audioGraphToJson() {
        PluginBase.call(this);
        this.pluginMetadata = pluginMetadata;
    }

    audioGraphToJson.metadata = pluginMetadata;
    audioGraphToJson.prototype = Object.create(PluginBase.prototype);
    audioGraphToJson.prototype.constructor = audioGraphToJson;

    /**
     * Creates a json description of the audioGraph, then stores the descriptor in blob storage.
     * To be used by AudioPlayer visualizer
     * 
     * @param {function(Error|null, plugin.PluginResult)} callback - the result callback
     */
    audioGraphToJson.prototype.main = function (callback) {
        var self = this;
        var core = self.core;
        var activeNode = self.activeNode;
        var artifactHash;
        var descriptorFileHash;
        var blobClient = self.blobClient;

        var ignoredAttrs = {
            name: true
        };

    
        // Create attribute name -> value dictionary for the given node
        function getAttributes(node) {
            var meta = core.getMetaType(node);
            var attrNames = meta ? core.getAttributeNames(meta) || [] : [];

            // filter out non web audio relevant attributes
            attrNames = attrNames.filter(attr => !ignoredAttrs[attr]);

            var attrs = {};
            attrNames.forEach(name => {
                var value = core.getAttribute(node, name);
                if (value !== undefined) {
                    attrs[name] = value;
                }
            });

            return attrs;
        }

        // Generates a descriptor of the audioGraph that the visualizer can use to build the webaudio graph
        function generateGraph(audioGraphNode) {
            return core.loadChildren(audioGraphNode).then(children => {
                var nodes = {};
                var connections = [];

                children.forEach(child => {
                    var meta = core.getMetaType(child);
                    var typeName = core.getAttribute(meta, 'name');
                    var path = core.getPath(child);

                    // Add connections to the connections list
                    if (typeName === 'AudioConnection') {
                        var src = core.getPointerPath(child, 'src');
                        var dst = core.getPointerPath(child, 'dst');
                        connections.push({ src: src, dst: dst });
                        return;
                    }

                    // Add node to the nodes list
                    nodes[path] = {
                        type: typeName,
                        name: core.getAttribute(child, 'name'),
                        attrs: getAttributes(child)
                    };
                });

                return {
                    nodes: nodes,
                    connections: connections,
                };
            });
        }


        generateGraph(activeNode)
            // Creates json descriptor of the audio graph to be used by AudioPlayer visualizer
            .then(descriptor => {
                var artifact = blobClient.createArtifact('audio-graph');
                return artifact.addFile('graph.json', JSON.stringify(descriptor, null, 2))
                    .then(fileHash => {
                        descriptorFileHash = fileHash;
                        return artifact.save();
                    });
            })
            // Add descriptor hash as attribute (used by visualizer to load descriptor options)
            .then(hash => {
                artifactHash = hash;
                self.core.setAttribute(activeNode, 'graphDescriptorFileHash', descriptorFileHash);
                return self.save('Exported audio graph descriptor.');
            })
            // Set plugin result
            .then(() => {
                self.result.addArtifact(artifactHash);
                self.result.setSuccess(true);
                callback(null, self.result);
            })
            .catch((err) => {
                // Result success is false at invocation.
                self.logger.error(err.stack);
                callback(err, self.result);
            });
    };

    return audioGraphToJson;
});
