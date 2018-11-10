var width = 800,
    height = 400;

var d3cola = cola.d3adaptor(d3)
    .linkDistance(120)
    .avoidOverlaps(true)
    .size([width, height]);

var svg = d3.select("body").append("svg")
    .attr("width", width)
    .attr("height", height);

var groupPadding = 3;

d3.json("parsed.json", function (error, graph) {
    var tables = [], columns = [];
    graph.statements.forEach(function(statement) {
        statement.expr.forEach(function(expr) {
            if (expr.table) {
                columns.push(expr)
            }
        });
        statement.from.forEach(function(from) {
            if (from.table) {
                tables.push(from)
            }
        });
    });
    graph.nodes = [];
    graph.groups = [];
    graph.constraints = [];

    tables.forEach(function(table) {
        graph.nodes.push(Object.assign({}, table, {name: table.table, type: "table-title"}));
    });
    columns.forEach(function(column, i){
        graph.nodes.push(Object.assign({}, column, {name: column.column, type: "table-column"}));
        graph.nodes.filter(function(otherNode, j) {
            return (column.table === otherNode.table && (otherNode.type === "table-title" || (otherNode.type === "table-column"))) ||
                   (column.table === otherNode.alias && otherNode.type === "table-title")
        })
            .forEach(function(otherColumn, j) {
                graph.groups.push({leaves: [j, i]})
            });
    });

    graph.links = [];


    graph.nodes.forEach(function (v) {
        v.width = 60 + v.name.length * 16;
        v.height = 40;
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
        .call(d3cola.drag);

    var link = svg.selectAll(".link")
        .data(graph.links)
        .enter().append("line")
        .attr("class", "link");

    var node = svg.selectAll(".node")
        .data(graph.nodes)
        .enter().append("rect")
        .attr("class", function(d) { return "node " + d.type; })
        .attr("width", function (d) {
            return d.width - groupPadding*2;
        })
        .attr("height", function (d) {
            return d.height - groupPadding*2;
        })
        .attr("rx", 5).attr("ry", 5)/*
        .style("fill", function (d) {
            return color(1);
        })*/;

    var label = svg.selectAll(".label")
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
                var h = this.getBBox().height;
                return d.y + h / 4;
            });
    });
});