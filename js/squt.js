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

const color = d3.scaleOrdinal(d3.schemeAccent);

const tables = [],
      columns = [],
      tableAliases = [],
      columnAliases = [];

function getTableAliasWidth(tableAlias) {
    return Math.max(3, tableAlias.name.length) * 20;
}

function getRelatedAliasTableFromColumnAlias(alias) {
    return graph.nodes.filter(node => node.type === "table-alias" && node.name === alias)[0];
}

function getRelatedTableFromColumnAlias(alias) {
    return getRelatedTableFromTableAlias(
      getRelatedAliasTableFromColumnAlias(alias)
    )
}

function getRelatedTableFromTableAlias(aliasTable) {
    return graph.nodes.filter(node => node.type === "table-title" && node.name === aliasTable.table)[0];
}

function alignColumnOrAlias(node, relatedTable) {
    graph.groups.filter(group => group.id === `${relatedTable.id}_columns`)[0].leaves.push(node.id);

    const relatedColumns = graph.nodes.filter(otherNode => node.table === otherNode.table && otherNode.type === node.type && otherNode.id !== node.id);

    const previousRelatedColumn = relatedColumns[relatedColumns.length - 1];
    const nodeOnTop = previousRelatedColumn !== undefined ? previousRelatedColumn : relatedTable;

    if (nodeOnTop) {
        // The column and the table name should be X-aligned
        positionRelativeTo(node, nodeOnTop, "y", 40);
    }
}

function alignTableAlias(node, relatedTable) {
    graph.groups.filter(group => group.id === `${relatedTable.id}_aliases`)[0].leaves.push(node.id);

    // The table alias and the table name should be Y-aligned
    positionRelativeTo(node, relatedTable, "x", tableWidth / 2 + getTableAliasWidth(node) / 2);
}

function positionRelativeTo(node, relativeNode, gapAxis, gap) {
    graph.constraints.push({
      type: "alignment",
      axis: gapAxis === "x" ? "y" : "x",
      offsets: [
        {node: relativeNode.id, offset: 0},
        {node: node.id, offset: 0}
      ]
    });
    graph.constraints.push({
      axis: gapAxis,
      left: relativeNode.id,
      right: node.id,
      gap,
      equality: true
    });
}

function addNode(title, type, data, forOutputTable = false) {
    const nodeId = graph.nodes.length;

    data = {...data, id: nodeId, name: title, type, width: tableWidth, height: 40};
    graph.nodes.push(data);

    let relatedTable;

    switch (type) {
        case 'table-column':
            relatedTable = graph.nodes.filter(otherNode =>
              (data.table === otherNode.table || data.table === otherNode.alias)
              && otherNode.type === "table-title")[0];
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

            graph.groups.filter(group => group.id === `${relatedTable.id}_aliases`)[0].leaves.push(nodeId);

            // The column alias and the table alias should be X-aligned
            graph.constraints.push(
              {type: "alignment", axis: "x", offsets: [{node: relatedAliasTable.id, offset: 0}, {node: nodeId, offset: 0}]});
            if (!forOutputTable) {
                addNode(title, "table-column", {table: "OUTPUT", name: data.name}, true);

                const columnAliasForOutputNodeId = addNode(title, type, {table: "output", name: data.name}, true);
                alignColumnOrAlias(graph.nodes[columnAliasForOutputNodeId], getRelatedTableFromColumnAlias("output"));

                // TODO Do not link to output if the column alias isn't part of the output expression
                graph.links.push({source: nodeId, target: columnAliasForOutputNodeId});

                const relatedColumn = graph.nodes.filter(node =>
                  node.type === "table-column" &&
                  node.name === data.column &&
                  node.table === data.table)[0];
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

(async () => {
    const response = await d3.json("parsed.json");

    response.forEach(statement => {
        if (statement.expr) {
            tables.push({table: "OUTPUT"});
            tableAliases.push({table: "OUTPUT", alias: "output"})
        }

        statement.from.forEach(from => {
            if (from.table) {
                tables.push(from);
                tableAliases.push({table: from.table, alias: from.alias})
            }
        });
        statement.join.forEach(join => {
            if (join.expr) {
                tables.push(join.expr);
                tableAliases.push({table: join.expr.table, alias: join.expr.alias});
            }
        });
        statement.expr.forEach(expr => {
            if (expr.table) {
                columns.push(expr);
                columnAliases.push(expr)
            }
        });
    });

    tables.forEach(table => {
        const tableNodeId = addNode(table.table, "table-title", table);

        const columnGroupId = graph.groups.length;
        graph.groups.push({id: `${tableNodeId}_columns`, leaves: [tableNodeId], name: table.table});

        graph.groups.push({id: `${tableNodeId}_aliases`, leaves: []});

        graph.groups.push({id: tableNodeId, leaves: [], groups: [columnGroupId]});
    });

    columns.forEach(column => {
        addNode(column.column, "table-column", column);
    });

    tableAliases.forEach(tableAlias => {
        addNode(tableAlias.alias, "table-alias", tableAlias);
    });

    columnAliases.forEach(columnAlias => {
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
      .attr("id", d => d.id)
      .attr("class", "group table")
      .attr("rx", 8).attr("ry", 8)
      .style("fill", (d, i) => color(i))
      .call(d3cola.drag);

    const node = svg.selectAll(".node")
      .data(graph.nodes)
      .enter().append("rect")
      .attr("id", (d, i) => `node-${i}`)
      .attr("class", d => `node ${d.type}`)
      .attr("width", d => d.width - groupPadding * 2)
      .attr("height", d => d.height - groupPadding * 2)
      .attr("rx", 5).attr("ry", 5);

    const nodeCenters = svg.selectAll(".node-center")
      .data(graph.nodes)
      .enter().append("circle")
      .attr("class", d => `node-center ${d.type}`)
      .attr("r", 5);

    const label = svg.selectAll(".label")
      .data(graph.nodes)
      .enter().append("text")
      .attr("class", "label")
      .text(d => d.name);

    const link = svg.selectAll(".link")
      .data(graph.links)
      .enter().append("line")
      .attr("class", "link");

    d3cola.on("tick", () => {
        link
          .attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y);

        node
          .attr("x", d => d.x + groupPadding - d.width / 2)
          .attr("y", d => d.y + groupPadding + columnTopPadding - d.height / 2);

        nodeCenters
          .attr("cx", d => d.x)
          .attr("cy", d => d.y);

        label
          .attr("x", d => d.x)
          .attr("y", function(d) { return d.y + columnTopPadding + this.getBBox().height / 4; });

        group
          .attr("x", d => d.bounds.x)
          .attr("y", d => d.bounds.y)
          .attr("width", d => d.bounds.width())
          .attr("height", d => d.bounds.height());
    });
})();
