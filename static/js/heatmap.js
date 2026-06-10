/**
 * Hour × Weekday Heatmap Visualization
 * Shows accident frequency and severity patterns across hours and weekdays
 */

let heatmapSvg;
let heatmapData = [];
let selectedCells = new Set(); // Tracks selected hour×weekday combinations

const WEEKDAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HEATMAP_MARGIN = { top: 40, right: 20, bottom: 20, left: 70 };
const CELL_SIZE = 35;

function initHeatmap(data) {
    heatmapData = data;

    const width = CELL_SIZE * WEEKDAY_ORDER.length + HEATMAP_MARGIN.left + HEATMAP_MARGIN.right;
    const height = CELL_SIZE * 24 + HEATMAP_MARGIN.top + HEATMAP_MARGIN.bottom;

    const svg = d3.select("#heatmap-container")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .style("border", "1px solid #ccc")
        .style("border-radius", "4px");

    heatmapSvg = svg;

    const g = svg.append("g")
        .attr("transform", `translate(${HEATMAP_MARGIN.left},${HEATMAP_MARGIN.top})`);

    // Build lookup: hour + weekday → data row
    const dataMap = new Map(data.map(d => [`${d.hour}|${d.weekday}`, d]));

    // Color scale: based on severity_index_per_1000
    const severityValues = data.map(d => d.severity_index_per_1000).filter(v => v != null);
    const colorScale = d3.scaleLinear()
        .domain([0, d3.max(severityValues)])
        .range(["#fff9e6", "#d62728"]);

    window._heatmapColorScale = colorScale; // For legend

    // X-axis: weekdays
    g.append("g")
        .selectAll("text")
        .data(WEEKDAY_ORDER)
        .join("text")
        .attr("x", (d, i) => i * CELL_SIZE + CELL_SIZE / 2)
        .attr("y", -5)
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .text(d => d.substring(0, 3));

    // Y-axis: hours
    g.append("g")
        .selectAll("text")
        .data(d3.range(0, 24))
        .join("text")
        .attr("x", -8)
        .attr("y", (d, i) => i * CELL_SIZE + CELL_SIZE / 2 + 4)
        .attr("text-anchor", "end")
        .attr("font-size", "11px")
        .text(d => `${d}:00`);

    // Cells (rects)
    g.append("g")
        .attr("id", "heatmap-cells")
        .selectAll("rect")
        .data(() => {
            const cells = [];
            for (let h = 0; h < 24; h++) {
                for (let w of WEEKDAY_ORDER) {
                    cells.push({ hour: h, weekday: w });
                }
            }
            return cells;
        })
        .join("rect")
        .attr("class", "heatmap-cell")
        .attr("x", (d) => WEEKDAY_ORDER.indexOf(d.weekday) * CELL_SIZE)
        .attr("y", (d) => d.hour * CELL_SIZE)
        .attr("width", CELL_SIZE)
        .attr("height", CELL_SIZE)
        .attr("stroke", "#999")
        .attr("stroke-width", 0.5)
        .attr("data-hour", (d) => d.hour)
        .attr("data-weekday", (d) => d.weekday)
        .attr("fill", (d) => {
            const row = dataMap.get(`${d.hour}|${d.weekday}`);
            return row ? colorScale(row.severity_index_per_1000) : "#f0f0f0";
        })
        .on("mouseover", function(event, d) {
            const row = dataMap.get(`${d.hour}|${d.weekday}`);
            if (row) {
                const tooltip = d3.select("#heatmap-tooltip");
                tooltip.html(`
                    <strong>${d.weekday} ${d.hour}:00</strong><br/>
                    Total: ${row.total_accidents}<br/>
                    Severity Index: ${row.severity_index_per_1000.toFixed(1)}<br/>
                    Fatal: ${row.fatal_count} | Serious: ${row.serious_count} | Slight: ${row.slight_count}
                `)
                    .style("display", "block")
                    .style("left", (event.pageX + 12) + "px")
                    .style("top", (event.pageY - 10) + "px");
            }
        })
        .on("mousemove", function(event) {
            d3.select("#heatmap-tooltip")
                .style("left", (event.pageX + 12) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function() {
            d3.select("#heatmap-tooltip").style("display", "none");
        })
        .on("click", function(event, d) {
            event.stopPropagation();
            const cellKey = `${d.hour}|${d.weekday}`;
            if (selectedCells.has(cellKey)) {
                selectedCells.delete(cellKey);
                d3.select(this).attr("stroke", "#999").attr("stroke-width", 0.5);
            } else {
                selectedCells.add(cellKey);
                d3.select(this).attr("stroke", "#000").attr("stroke-width", 2);
            }
            // Trigger filter event for other visualizations
            triggerHeatmapFilter();
        });

    // Add legend
    addHeatmapLegend(g, colorScale, width);
}

function addHeatmapLegend(g, colorScale, width) {
    const legendGroup = g.append("g")
        .attr("transform", `translate(${CELL_SIZE * WEEKDAY_ORDER.length + 10}, 0)`);

    const legendStops = [0, 25, 50, 75, 100];
    const legendScale = d3.scaleLinear()
        .domain([0, 100])
        .range([0, 100]);

    legendStops.forEach((d, i) => {
        legendGroup.append("rect")
            .attr("x", 0)
            .attr("y", i * 12)
            .attr("width", 12)
            .attr("height", 12)
            .attr("fill", colorScale(d));

        legendGroup.append("text")
            .attr("x", 18)
            .attr("y", i * 12 + 10)
            .attr("font-size", "10px")
            .text(`${d.toFixed(0)}`);
    });

    legendGroup.append("text")
        .attr("x", 0)
        .attr("y", -5)
        .attr("font-size", "11px")
        .attr("font-weight", "bold")
        .text("Severity");
}

function triggerHeatmapFilter() {
    // Dispatch custom event to notify other visualizations
    const hours = Array.from(selectedCells).map(cell => parseInt(cell.split("|")[0]));
    const weekdays = Array.from(selectedCells).map(cell => cell.split("|")[1]);

    const event = new CustomEvent("heatmapFilterChanged", {
        detail: { hours, weekdays, selectedCells: Array.from(selectedCells) }
    });
    document.dispatchEvent(event);
}

function filterMapByHeatmap(hours, weekdays) {
    /**
     * Filter the map visualization to show only accidents from selected hour×weekday combinations
     */
    if (!hours.length && !weekdays.length) {
        // Reset: show all
        d3.selectAll(".region-path").attr("opacity", 1);
        return;
    }

    // This would require access to the original data with hour and weekday info
    // For now, provide visual feedback on heatmap itself
    d3.selectAll(".heatmap-cell")
        .attr("opacity", d => hours.includes(d.hour) && weekdays.includes(d.weekday) ? 1 : 0.3);
}

function filterPCByHeatmap(selectedCells) {
    /**
     * Filter parallel coordinates to show only records matching selected hour×weekday
     */
    if (!selectedCells.length) {
        d3.selectAll(".pc-path").attr("opacity", 0.5);
        return;
    }

    const cellSet = new Set(selectedCells);
    const WEEKDAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    
    d3.selectAll(".pc-path")
        .attr("opacity", d => {
            const dayName = WEEKDAY_ORDER[d.day_of_week] || null;
            const key = dayName ? `${d.hour}|${dayName}` : null;
            return key && cellSet.has(key) ? 0.8 : 0.1;
        });
}
