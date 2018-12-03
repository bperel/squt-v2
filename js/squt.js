const width = 800,
      height = 400;

const d3cola = cola.d3adaptor(d3)
    .linkDistance(120)
    .symmetricDiffLinkLengths(6)
    .avoidOverlaps(true)
    .size([width, height]);

const svg = d3.select("body").append("svg");

const groupPadding = 3;
const columnTopPadding = 0;
const tableWidth = 200;

let graph = {
    nodes: [],
    links: [],
    groups: [],
    constraints: []
};

const color = d3.scaleOrdinal(d3.schemeCategory20);

const tables = [],
      columns = [],
      tableAliases = [],
      columnAliases = [];

function getTableAliasWidth(tableAlias) {
    return Math.max(3, tableAlias.name.length) * 20;
}

function getRelatedAliasTableFromColumnAlias(alias) {
    return graph.nodes.filter(function(node) { return node.type === "table-alias" && node.name === alias})[0];
}

function getRelatedTableFromColumnAlias(alias) {
    const relatedAliasTable = getRelatedAliasTableFromColumnAlias(alias);
    return getRelatedTableFromTableAlias(relatedAliasTable)
}

function getRelatedTableFromTableAlias(aliasTable) {
    return graph.nodes.filter(function(node) { return node.type === "table-title" && node.name === aliasTable.table})[0];
}

function alignColumnOrAlias(node, relatedTable) {
    graph.groups.filter(function(group) {
        return group.id === relatedTable.id + "_columns"
    })[0].leaves.push(node.id);

    const relatedColumns = graph.nodes.filter(function (otherNode) {
        return node.table === otherNode.table && otherNode.type === node.type && otherNode.id !== node.id;
    });

    const previousRelatedColumn = relatedColumns[relatedColumns.length - 1];
    const nodeOnTop = previousRelatedColumn !== undefined ? previousRelatedColumn : relatedTable;

    if (nodeOnTop) {
        // The column and the table name should be X-aligned
        positionRelativeTo(node, nodeOnTop, "y", 40);
    }
}

function alignTableAlias(node, relatedTable) {
    graph.groups.filter(function (group) {
        return group.id === relatedTable.id + "_aliases"
    })[0].leaves.push(node.id);

    // The table alias and the table name should be Y-aligned
    positionRelativeTo(node, relatedTable, "x", tableWidth / 2 + getTableAliasWidth(node) / 2);
}

function positionRelativeTo(node, relativeNode, gapAxis, gap) {
    graph.constraints.push(
        {type: "alignment", axis: gapAxis === "x" ? "y" : "x", offsets: [{node: relativeNode.id, offset: 0}, {node: node.id, offset: 0}]});
    graph.constraints.push(
        {axis: gapAxis, left: relativeNode.id, right: node.id, gap: gap, equality: true});
}

d3.json("parsed.json", function (error, response) {

    function addNode(title, type, data, forOutputTable = false) {
        const nodeId = graph.nodes.length;

        data = Object.assign({}, {id: nodeId, name: title, type: type, width: tableWidth, height: 40}, data);
        graph.nodes.push(data);

        let relatedTable;

        switch (type) {
            case 'table-column':
                relatedTable = graph.nodes.filter(function (otherNode) {
                    return (data.table === otherNode.table || data.table === otherNode.alias)
                        && otherNode.type === "table-title"
                })[0];
                alignColumnOrAlias(data, relatedTable);
            break;
            case 'table-alias':
                relatedTable = getRelatedTableFromTableAlias(data);
                alignTableAlias(data, relatedTable);
                graph.nodes[nodeId].width = getTableAliasWidth(graph.nodes[nodeId]);
            break;
            case 'column-alias':
                const relatedAliasTable = getRelatedAliasTableFromColumnAlias(data.table);
                relatedTable = getRelatedTableFromColumnAlias(data.table);
                graph.nodes[nodeId].width = relatedAliasTable.width;

                graph.groups.filter(function(group) { return group.id === relatedTable.id + "_aliases"})[0].leaves.push(nodeId);

                // The column alias and the table alias should be X-aligned
                graph.constraints.push(
                    {type: "alignment", axis: "x", offsets: [{node: relatedAliasTable.id, offset: 0}, {node: nodeId, offset: 0}]});
                if (!forOutputTable) {
                    addNode(title, "table-column", {table: "OUTPUT", name: data.name}, true);

                    const columnAliasForOutputNodeId = addNode(title, type, {table: "output", name: data.name}, true);
                    alignColumnOrAlias(graph.nodes[columnAliasForOutputNodeId], getRelatedTableFromColumnAlias("output"));

                    // TODO Do not link to output if the column alias isn't part of the output expression
                    graph.links.push({source: nodeId, target: columnAliasForOutputNodeId});

                    const relatedColumn = graph.nodes.filter(function(node) { return node.type === "table-column" && node.name === data.column && node.table === data.table})[0];
                    // The column alias and the table column should be Y-aligned
                    graph.constraints.push(
                        {type: "alignment", axis: "y", offsets: [{node: relatedColumn.id, offset: 0}, {node: nodeId, offset: 0}]});
                }
                break;
            default:
                break;
        }
        return nodeId;
    }

    response.statements.forEach(function(statement) {
        if (statement.expr) {
            tables.push({table: "OUTPUT"});
            tableAliases.push({table: "OUTPUT", alias: "output"})
        }

        statement.from.forEach(function(from) {
            if (from.table) {
                tables.push(from);
                tableAliases.push({table: from.table, alias: from.alias})
            }
        });
        statement.join.forEach(function(join) {
            if (join.expr) {
                tables.push(join.expr);
                tableAliases.push({table: join.expr.table, alias: join.expr.alias});
            }
        });
        statement.expr.forEach(function(expr) {
            if (expr.table) {
                columns.push(expr);
                columnAliases.push(expr)
            }
        });
    });

    tables.forEach(function(table) {
        const tableNodeId = addNode(table.table, "table-title", table);

        const columnGroupId = graph.groups.length;
        graph.groups.push({id: tableNodeId + "_columns", leaves: [tableNodeId], name: table.table});

        graph.groups.push({id: tableNodeId + "_aliases", leaves: []});

        graph.groups.push({id: tableNodeId, leaves: [], groups: [columnGroupId]});
    });

    columns.forEach(function(column){
        addNode(column.column, "table-column", column);
    });

    tableAliases.forEach(function(tableAlias) {
        addNode(tableAlias.alias, "table-alias", tableAlias);
    });

    columnAliases.forEach(function(columnAlias) {
        addNode(columnAlias.alias, "column-alias", columnAlias);
    });

    d3cola
        .nodes(graph.nodes)
        .links(graph.links)
        .groups(graph.groups)
        .constraints(graph.constraints)
        .linkDistance(200)
        .avoidOverlaps(true)
        .start(10, 10, 10);

    const group = svg.selectAll(".group")
        .data(graph.groups)
        .enter().append("rect")
        .attr("id", function(d) { return d.id;})
        .attr("class", "group table")
        .attr("rx", 8).attr("ry", 8)
        .style("fill", function (d, i) { return color(i); })
        .call(d3cola.drag);

    const node = svg.selectAll(".node")
        .data(graph.nodes)
        .enter().append("rect")
        .attr("id", function (d, i) {
            return "node-" + i;
        })
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

    const nodeCenters = svg.selectAll(".node-center")
        .data(graph.nodes)
        .enter().append("circle")
        .attr("class", function (d) {
            return "node-center " + d.type;
        })
        .attr("r", 5);

    const label = svg.selectAll(".label")
        .data(graph.nodes)
        .enter().append("text")
        .attr("class", "label")
        .text(function (d) {
            return d.name;
        });

    const link = svg.selectAll(".link")
        .data(graph.links)
        .enter().append("line")
        .attr("class", "link");

    d3cola.on("tick", function () {
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
                return d.y + groupPadding + columnTopPadding - d.height / 2;
            });

        nodeCenters
            .attr("cx", function (d) {
                return d.x;
            })
            .attr("cy", function (d) {
                return d.y;
            });

        label
            .attr("x", function (d) {
                return d.x;
            })
            .attr("y", function (d) {
                const h = this.getBBox().height;
                return d.y + columnTopPadding + h / 4;
            });

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
                return d.bounds.height() ;
            });
    });
});