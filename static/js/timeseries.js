function initTimeSeries(monthlyData) {
    const container = d3.select("#svg_timeseries");
    const width = Math.max(680, Math.min(980, container.node().getBoundingClientRect().width || 900));
    const height = 300;
    const margin = { top: 28, right: 28, bottom: 56, left: 64 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Create SVG
    const svg = container
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMinYMid meet")
        .attr("width", "100%")
        .attr("height", height);

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Parse months "2023-01" → Date
    const parseMonth = d3.timeParse("%Y-%m");
    const data = monthlyData.map(d => ({
        ...d,
        date: parseMonth(d.month),
        total: +d.total_accidents,
        fatal: +d.fatal_count,
        serious: +d.serious_count,
        slight: +d.slight_count
    })).filter(d => d.date);

    // X scale: time
    const xScale = d3.scaleTime()
        .domain(d3.extent(data, d => d.date))
        .range([0, innerWidth]);

    // Y scale: total accidents
    const yMax = d3.max(data, d => d.total) || 1;
    const yScale = d3.scaleLinear()
        .domain([0, yMax * 1.08])
        .nice()
        .range([innerHeight, 0]);

    // X axis
    g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale)
            .ticks(d3.timeMonth.every(2))
            .tickFormat(d3.timeFormat("%b %Y")))
        .selectAll("text")
        .attr("transform", "rotate(-45)")
        .style("text-anchor", "end");

    // Y axis
    g.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(yScale).ticks(6));

    g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -50)
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .text("Total Accidents per Month");

    // ── Stacked area chart: slight (bottom) → serious → fatal (top) ──
    const stackKeys = ["slight", "serious", "fatal"];
    const stackColors = { slight: "#4caf50", serious: "#ff9800", fatal: "#d32f2f" };

    const stack = d3.stack()
        .keys(stackKeys)
        .order(d3.stackOrderNone)
        .offset(d3.stackOffsetNone);

    const series = stack(data);

    const areaGen = d3.area()
        .x(d => xScale(d.data.date))
        .y0(d => yScale(d[0]))
        .y1(d => yScale(d[1]))
        .curve(d3.curveMonotoneX);

    g.selectAll(".stacked-area")
        .data(series)
        .join("path")
        .attr("class", "stacked-area")
        .attr("d", areaGen)
        .attr("fill", d => stackColors[d.key])
        .attr("opacity", 0.75);

    // Outline on top of stack (total)
    const totalLine = d3.line()
        .x(d => xScale(d.date))
        .y(d => yScale(d.total))
        .curve(d3.curveMonotoneX);

    g.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "#333")
        .attr("stroke-width", 1.2)
        .attr("d", totalLine);

    // ── Hover crosshair for monthly details ──
    const hoverLine = g.append("line")
        .attr("stroke", "#666")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3 2")
        .attr("y1", -8)
        .attr("y2", innerHeight)
        .style("display", "none");

    const hoverLabel = g.append("text")
        .attr("font-size", "12px")
        .attr("font-weight", "600")
        .attr("fill", "#17324d")
        .attr("text-anchor", "middle")
        .attr("paint-order", "stroke")
        .attr("stroke", "rgba(255,255,255,0.95)")
        .attr("stroke-width", "3")
        .style("display", "none");

    // Hover crosshair is triggered from the brush overlay (added below)

    // Legend (top-right)
    const legend = svg.append("g")
        .attr("transform", `translate(${Math.max(12, width - 162)}, ${margin.top + 6})`);

    legend.append("rect")
        .attr("x", -8)
        .attr("y", -6)
        .attr("width", 110)
        .attr("height", 58)
        .attr("rx", 8)
        .attr("fill", "rgba(255,255,255,0.94)")
        .attr("stroke", "rgba(15, 23, 42, 0.08)");

    const legendItems = [
        { key: "Slight",  color: stackColors.slight },
        { key: "Serious", color: stackColors.serious },
        { key: "Fatal",   color: stackColors.fatal },
    ];
    legendItems.forEach((item, i) => {
        legend.append("rect")
            .attr("x", 0).attr("y", i * 18)
            .attr("width", 14).attr("height", 14)
            .attr("rx", 2)
            .attr("fill", item.color)
            .attr("opacity", 0.75);
        legend.append("text")
            .attr("x", 20).attr("y", i * 18 + 11)
            .attr("font-size", "12px")
            .attr("fill", "#17324d")
            .text(item.key);
    });

    // ── BRUSH 
    const brush = d3.brushX()
        .extent([[0, 0], [innerWidth, innerHeight]])
        .on("brush end", function(event) {
            if (!event.selection) {
                // Brush cleared → show all data
                updateChoroplethByMonths(null);
                return;
            }

            // Get pixel range of brush selection
            const [x0, x1] = event.selection;
            
            // Convert pixels back to dates
            const date0 = xScale.invert(x0);
            const date1 = xScale.invert(x1);

            const selectedMonths = data
                .filter(d => d.date >= date0 && d.date <= date1)
                .map(d => d.month);

            updateChoroplethByMonths(selectedMonths.length > 0 ? selectedMonths : null);
        });

    // Add brush layer (on top of chart)
    const brushG = g.append("g")
        .attr("class", "brush")
        .call(brush);

    // Attach hover crosshair to brush overlay (so it coexists with brush)
    brushG.select(".overlay")
        .on("mousemove.crosshair", function(event) {
            const [mx] = d3.pointer(event, this);
            const dateAtMouse = xScale.invert(mx);
            const bisect = d3.bisector(d => d.date).left;
            let idx = bisect(data, dateAtMouse, 1);
            if (idx >= data.length) idx = data.length - 1;
            if (idx > 0 && dateAtMouse - data[idx - 1].date < data[idx].date - dateAtMouse) idx--;
            const d = data[idx];
            const x = xScale(d.date);
            hoverLine.attr("x1", x).attr("x2", x).style("display", null);
            hoverLabel.attr("x", x).attr("y", -14)
                .text(`${d.month}: ${d.slight.toLocaleString()} slight · ${d.serious.toLocaleString()} serious · ${d.fatal} fatal`)
                .style("display", null);
        })
        .on("mouseout.crosshair", function() {
            hoverLine.style("display", "none");
            hoverLabel.style("display", "none");
        });
}