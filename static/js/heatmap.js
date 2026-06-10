let heatmapData = [];
let selectedCells = new Set();

const WEEKDAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HEATMAP_MARGIN = { top: 50, right: 90, bottom: 20, left: 70 };
const CELL_SIZE = 35;

function initHeatmap(data, containerId = "heatmap-container", metric = "total_accidents", metricLabel = "Accidents") {
    heatmapData = data;

    const width  = CELL_SIZE * WEEKDAY_ORDER.length + HEATMAP_MARGIN.left + HEATMAP_MARGIN.right;
    const height = CELL_SIZE * 24 + HEATMAP_MARGIN.top + HEATMAP_MARGIN.bottom;

    const svg = d3.select(`#${containerId}`)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .style("border", "1px solid #ddd")
        .style("border-radius", "4px");

    const g = svg.append("g")
        .attr("transform", `translate(${HEATMAP_MARGIN.left},${HEATMAP_MARGIN.top})`);

    const dataMap = new Map(data.map(d => [`${d.hour}|${d.weekday}`, d]));

    const values = data.map(d => d[metric]).filter(v => v != null);
    const [minVal, maxVal] = d3.extent(values);
    const midVal = (minVal + maxVal) / 2;
    const colorScale = d3.scaleLinear()
        .domain([minVal, midVal, maxVal])
        .range(["#4caf50", "#ffcc00", "#d62728"]);

    // X-axis: weekdays
    g.append("g")
        .selectAll("text")
        .data(WEEKDAY_ORDER)
        .join("text")
        .attr("x", (d, i) => i * CELL_SIZE + CELL_SIZE / 2)
        .attr("y", -8)
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

    // Cells
    g.append("g")
        .attr("id", `heatmap-cells-${containerId}`)
        .selectAll("rect")
        .data(() => {
            const cells = [];
            for (let h = 0; h < 24; h++)
                for (let w of WEEKDAY_ORDER)
                    cells.push({ hour: h, weekday: w });
            return cells;
        })
        .join("rect")
        .attr("class", "heatmap-cell")
        .attr("x", d => WEEKDAY_ORDER.indexOf(d.weekday) * CELL_SIZE)
        .attr("y", d => d.hour * CELL_SIZE)
        .attr("width", CELL_SIZE)
        .attr("height", CELL_SIZE)
        .attr("stroke", "#ccc")
        .attr("stroke-width", 0.5)
        .attr("data-hour", d => d.hour)
        .attr("data-weekday", d => d.weekday)
        .attr("fill", d => {
            const row = dataMap.get(`${d.hour}|${d.weekday}`);
            return row ? colorScale(row[metric]) : "#f0f0f0";
        })
        .on("mouseover", function(event, d) {
            const row = dataMap.get(`${d.hour}|${d.weekday}`);
            if (!row) return;
            d3.select("#heatmap-tooltip")
                .html(`<strong>${d.weekday} ${d.hour}:00</strong><br/>
                       Accidents: ${row.total_accidents}<br/>
                       Severity: ${row.severity_index_per_1000.toFixed(1)}<br/>
                       Fatal: ${row.fatal_count} | Serious: ${row.serious_count} | Slight: ${row.slight_count}`)
                .style("display", "block")
                .style("left", (event.pageX + 12) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mousemove", function(event) {
            d3.select("#heatmap-tooltip")
                .style("left", (event.pageX + 12) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", () => d3.select("#heatmap-tooltip").style("display", "none"))
        .on("click", function(event, d) {
            event.stopPropagation();
            const cellKey = `${d.hour}|${d.weekday}`;
            const twins = d3.selectAll(`.heatmap-cell[data-hour="${d.hour}"][data-weekday="${d.weekday}"]`);
            if (selectedCells.has(cellKey)) {
                selectedCells.delete(cellKey);
                twins.attr("stroke", "#ccc").attr("stroke-width", 0.5);
            } else {
                selectedCells.add(cellKey);
                twins.attr("stroke", "#000").attr("stroke-width", 2);
            }
            triggerHeatmapFilter();
        });

    addHeatmapLegend(g, colorScale, metricLabel);
}

function addHeatmapLegend(g, colorScale, label) {
    const legendGroup = g.append("g")
        .attr("transform", `translate(${CELL_SIZE * WEEKDAY_ORDER.length + 12}, 0)`);

    legendGroup.append("text")
        .attr("x", 0).attr("y", -8)
        .attr("font-size", "11px")
        .attr("font-weight", "bold")
        .text(label);

    const [domainMin, domainMax] = [colorScale.domain()[0], colorScale.domain()[2]];
    const steps = 5;
    d3.range(steps).forEach(i => {
        const val = domainMin + (domainMax - domainMin) * i / (steps - 1);
        legendGroup.append("rect")
            .attr("x", 0).attr("y", i * 14)
            .attr("width", 12).attr("height", 12)
            .attr("fill", colorScale(val));
        legendGroup.append("text")
            .attr("x", 17).attr("y", i * 14 + 10)
            .attr("font-size", "10px")
            .text(val.toFixed(1));
    });
}

function triggerHeatmapFilter() {
    const event = new CustomEvent("heatmapFilterChanged", {
        detail: {
            hours: Array.from(selectedCells).map(c => parseInt(c.split("|")[0])),
            weekdays: Array.from(selectedCells).map(c => c.split("|")[1]),
            selectedCells: Array.from(selectedCells)
        }
    });
    document.dispatchEvent(event);
}

function filterMapByHeatmap(hours, weekdays) {
    if (!hours.length && !weekdays.length) {
        d3.selectAll(".region-path").attr("opacity", 1);
        return;
    }
    d3.selectAll(".heatmap-cell")
        .attr("opacity", d => hours.includes(d.hour) && weekdays.includes(d.weekday) ? 1 : 0.3);
}

function filterPCByHeatmap(selectedCells) {
    if (!selectedCells.length) {
        d3.selectAll(".pc-path").attr("opacity", 0.5);
        return;
    }
    const cellSet = new Set(selectedCells);
    d3.selectAll(".pc-path")
        .attr("opacity", d => {
            const dayName = WEEKDAY_ORDER[d.day_of_week] || null;
            const key = dayName ? `${d.hour}|${dayName}` : null;
            return key && cellSet.has(key) ? 0.8 : 0.1;
        });
}
