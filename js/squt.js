const width = 800,
      height = 400;

const d3cola = cola.d3adaptor(d3)
    .linkDistance(120)
    .avoidOverlaps(true)
    .size([width, height]);

const svg = d3.select("body").append("svg")
    .attr("width", width)
    .attr("height", height);

const groupPadding = 3;

let graph = {};

const color = d3.scaleOrdinal(d3.schemeCategory20);

d3.json("parsed.json", function (error, response) {

    function addNode(title, type, data) {
        const nodeId = graph.nodes.length;
        graph.nodes.push(Object.assign({}, data, {id: nodeId, name: title, type: type}));
        return nodeId;
    }

    const tables = [],
          columns = [],
          aliases = [];
    response.statements.forEach(function(statement) {
        statement.from.forEach(function(from) {
            if (from.table) {
                tables.push(from);
                aliases.push({table: from.table, alias: from.alias})
            }
        });
        statement.join.forEach(function(join) {
            if (join.expr) {
                tables.push(join.expr);
                aliases.push({table: join.expr.table, alias: join.expr.alias})
            }
        });
        statement.expr.forEach(function(expr) {
            if (expr.table) {
                columns.push(expr)
            }
        });
    });
    graph.nodes = [];
    graph.groups = [];
    graph.constraints = [];

    tables.forEach(function(table) {
        const tableNodeId = addNode(table.table, "table-title", table);

        const columnGroupId = graph.groups.length;
        graph.groups.push({id: tableNodeId + "_columns", leaves: [tableNodeId]});

        graph.groups.push({id: tableNodeId + "_aliases", leaves: []});

        graph.groups.push({id: tableNodeId, leaves: [], groups: [columnGroupId]});
    });

    aliases.forEach(function(alias) {
        const aliasNodeId = addNode(alias.alias, "table-alias", alias);
        const relatedTable = graph.nodes.filter(function(node) { return node.type === "table-title" && node.name === alias.table})[0];
        graph.groups.filter(function(group) { return group.id === relatedTable.id + "_aliases"})[0].leaves.push(aliasNodeId);
        graph.constraints.push(
            {type: "alignment", axis: "y", offsets: [{node: relatedTable.id, offset: 0}, {node: aliasNodeId, offset: 0}]},
            {axis: "x", left: relatedTable.id, right: aliasNodeId, equality: "true", gap: 100});
    });

    columns.forEach(function(column){
        const relatedNodes = graph.nodes.filter(function (otherNode) {
            return (column.table === otherNode.table || column.table === otherNode.alias) && otherNode.type === "table-title"
        });
        const columnNodeId = addNode(column.column, "table-column", column);
        relatedNodes.forEach(function(relatedNode) {
            graph.groups.filter(function(group) { return group.id === relatedNode.id + "_columns"})[0].leaves.push(columnNodeId);
        });
    });

    graph.links = [];

    graph.nodes.forEach(function (v) {
        if (v.type === 'table-title') {
            v.width = 200;
        }
        else {
            v.width = 60 + v.name.length * 16;
        }
        if (v.type === 'table-alias') {
            const relatedNodes = graph.nodes.filter(function (otherNode) {
                return (v.table === otherNode.table || v.alias === otherNode.table) && otherNode.type !== "table-alias"
            });
            v.height = d3.sum(relatedNodes, function(relatedNode) { return 40});
        }
        else {
            v.height = 40;
        }
    });
    d3cola
        .nodes(graph.nodes)
        .links(graph.links)
        .groups(graph.groups)
        .constraints(graph.constraints)
        .start(10, 10, 10);

    var group = svg.selectAll(".group")
        .data(graph.groups)
        .enter().append("rect")
        .attr("class", "group table")
        .attr("rx", 8).attr("ry", 8)
        .style("fill", function (d, i) { return color(i); })
        .call(d3cola.drag);

    const link = svg.selectAll(".link")
        .data(graph.links)
        .enter().append("line")
        .attr("class", "link");

    const node = svg.selectAll(".node")
        .data(graph.nodes)
        .enter().append("rect")
        .attr("class", function (d) {
            return "node " + d.type;
        })
        .attr("width", function (d) {
            return d.width - groupPadding * 2;
        })
        .attr("height", function (d) {
            return d.height - groupPadding * 2;
        })
        .attr("rx", 5).attr("ry", 5);

    const label = svg.selectAll(".label")
        .data(graph.nodes)
        .enter().append("text")
        .attr("class", "label")
        .text(function (d) {
            return d.name;
        });

    node.append("title")
        .text(function (d) {
            return d.name;
        });

    d3cola.on("tick", function () {

        group
            .attr("x", function (d) {
                return d.bounds.x;
            })
            .attr("y", function (d) {
                return d.bounds.y;
            })
            .attr("width", function (d) {
                return d.bounds.width();
            })
            .attr("height", function (d) {
                return d.bounds.height();
            });

        link
            .attr("x1", function (d) {
                return d.source.x;
            })
            .attr("y1", function (d) {
                return d.source.y;
            })
            .attr("x2", function (d) {
                return d.target.x;
            })
            .attr("y2", function (d) {
                return d.target.y;
            });

        node
            .attr("x", function (d) {
                return d.x + groupPadding - d.width / 2;
            })
            .attr("y", function (d) {
                return d.y + groupPadding - d.height / 2;
            });

        label
            .attr("x", function (d) {
                return d.x;
            })
            .attr("y", function (d) {
                const h = this.getBBox().height;
                return d.y + h / 4;
            });
    });
});