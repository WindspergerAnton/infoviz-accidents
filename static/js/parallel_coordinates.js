/**
 * Parallel Coordinates Visualization
 * Shows multivariate relationships across 8 dimensions with brushing
 */

let pcSvg;
let pcData = [];
let pcBrushes = new Map(); // Per-dimension brush selections

const PC_MARGIN = { top: 20, right: 20, bottom: 80, left: 60 };
const PC_DIMENSIONS = [
    { key: "hour", label: "Hour", type: "linear", domain: [0, 23] },
    { key: "day_of_week", label: "Day of Week", type: "linear", domain: [0, 6] },
    { key: "severity_score", label: "Severity", type: "linear", domain: [1, 10] },
    { key: "speed_limit", label: "Speed Limit", type: "linear" },
    { key: "is_dark", label: "Dark", type: "linear", domain: [0, 1] },
    { key: "is_bad_weather", label: "Bad Weather", type: "linear", domain: [0, 1] }
];

function initParallelCoordinates(data) {
    pcData = data;

    // Infer domains from data for dimensions without fixed domains
    PC_DIMENSIONS.forEach(dim => {
        if (!dim.domain) {
            const values = data.map(d => d[dim.key]).filter(v => v != null);
            dim.domain = [d3.min(values), d3.max(values)];
        }
    });

    const width = 900;
    const height = 400;

    const svg = d3.select("#pc-container")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .style("border", "1px solid #ccc")
        .style("border-radius", "4px");

    pcSvg = svg;

    const g = svg.append("g")
        .attr("transform", `translate(${PC_MARGIN.left},${PC_MARGIN.top})`);

    const plotWidth = width - PC_MARGIN.left - PC_MARGIN.right;
    const plotHeight = height - PC_MARGIN.top - PC_MARGIN.bottom;

    // Create scales for each dimension
    const scales = {};
    PC_DIMENSIONS.forEach((dim, i) => {
        scales[dim.key] = d3.scaleLinear()
            .domain(dim.domain)
            .range([0, plotHeight]);
    });

    const xScale = d3.scaleLinear()
        .domain([0, PC_DIMENSIONS.length - 1])
        .range([0, plotWidth]);

    // Draw axes
    const axes = g.selectAll(".pc-axis")
        .data(PC_DIMENSIONS)
        .join("g")
        .attr("class", "pc-axis")
        .attr("transform", (d, i) => `translate(${xScale(i)}, 0)`);

    // Axis lines
    axes.append("line")
        .attr("y1", 0)
        .attr("y2", plotHeight)
        .attr("stroke", "#999")
        .attr("stroke-width", 1);

    // Axis labels (bottom)
    axes.append("text")
        .attr("y", plotHeight + 15)
        .attr("text-anchor", "middle")
        .attr("font-size", "11px")
        .attr("font-weight", "bold")
        .text(d => d.label);

    // Draw data lines
    g.selectAll(".pc-path")
        .data(data)
        .join("path")
        .attr("class", "pc-path")
        .attr("d", d => {
            let path = "";
            PC_DIMENSIONS.forEach((dim, i) => {
                const x = xScale(i);
                const y = scales[dim.key](d[dim.key]);
                path += (i === 0 ? "M" : "L") + x + "," + y;
            });
            return path;
        })
        .attr("fill", "none")
        .attr("stroke", getLineColor)
        .attr("stroke-width", 1)
        .attr("opacity", 0.5)
        .on("mouseover", function(event, d) {
            d3.select(this)
                .attr("stroke-width", 2)
                .attr("opacity", 1);

            const tooltip = d3.select("#pc-tooltip");
            const details = PC_DIMENSIONS
                .map(dim => `${dim.label}: ${d[dim.key] != null ? (typeof d[dim.key] === 'number' ? d[dim.key].toFixed(1) : d[dim.key]) : 'N/A'}`)
                .join("<br/>");

            tooltip.html(`<strong>Accident</strong><br/>${details}`)
                .style("display", "block")
                .style("left", (event.pageX + 12) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mousemove", function(event) {
            d3.select("#pc-tooltip")
                .style("left", (event.pageX + 12) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function() {
            d3.select(this)
                .attr("stroke-width", 1)
                .attr("opacity", 0.5);
            d3.select("#pc-tooltip").style("display", "none");
        });

    // Add brushes to each axis
    axes.append("g")
        .attr("class", "pc-brush")
        .each(function(d, i) {
            const brush = d3.brushY()
                .extent([[-10, 0], [10, plotHeight]])
                .on("start", function() {
                    d3.selectAll(".pc-path").attr("opacity", 0.1);
                })
                .on("brush", function(event) {
                    if (!event.selection) return;
                    const [y0, y1] = event.selection;
                    applyPCBrush(d.key, scales[d.key].invert(y1), scales[d.key].invert(y0));
                })
                .on("end", function(event) {
                    if (!event.selection) {
                        pcBrushes.clear();
                        d3.selectAll(".pc-path").attr("opacity", 0.5);
                        // Trigger reset event
                        triggerPCFilter();
                    }
                });

            d3.select(this).call(brush);
        });

    // Legend
    g.append("text")
        .attr("x", plotWidth / 2)
        .attr("y", -5)
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .text("Parallel Coordinates: Brush axes to filter");
}

function getLineColor(d) {
    // Color by severity
    const severity = d.severity_score || 1;
    if (severity >= 10) return "#d62728"; // Fatal
    if (severity >= 3) return "#ff7f0e"; // Serious
    return "#1f77b4"; // Slight
}

function applyPCBrush(dimension, minVal, maxVal) {
    pcBrushes.set(dimension, [minVal, maxVal]);

    d3.selectAll(".pc-path")
        .attr("opacity", d => {
            for (const [dim, range] of pcBrushes) {
                if (d[dim] < range[0] || d[dim] > range[1]) {
                    return 0.1;
                }
            }
            return 0.8;
        });

    triggerPCFilter();
}

function triggerPCFilter() {
    const filteredData = pcData.filter(d => {
        for (const [dim, range] of pcBrushes) {
            if (d[dim] < range[0] || d[dim] > range[1]) {
                return false;
            }
        }
        return true;
    });

    const event = new CustomEvent("pcFilterChanged", {
        detail: { brushes: Object.fromEntries(pcBrushes), filteredData }
    });
    document.dispatchEvent(event);
}

function resetPCBrushes() {
    pcBrushes.clear();
    d3.selectAll(".pc-brush").call(d3.brush().clear);
    d3.selectAll(".pc-path").attr("opacity", 0.5);
}

// Listen for heatmap filter events
document.addEventListener("heatmapFilterChanged", (event) => {
    const { selectedCells } = event.detail;
    // Highlight PC paths that match selected hour×weekday
    // (Implementation depends on availability of original data)
});
