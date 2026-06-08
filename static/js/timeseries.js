function initTimeSeries(monthlyData) {
    const width = 900;
    const height = 280;
    const margin = { top: 20, right: 30, bottom: 60, left: 70 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Create SVG
    const svg = d3.select("#svg_timeseries")
        .append("svg")
        .attr("width", width)
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
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.total)])
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

    // Area fill (light blue)
    const area = d3.area()
        .x(d => xScale(d.date))
        .y0(innerHeight)
        .y1(d => yScale(d.total));

    g.append("path")
        .datum(data)
        .attr("fill", "steelblue")
        .attr("opacity", 0.2)
        .attr("d", area);

    // Line (blue) for total
    const line = d3.line()
        .x(d => xScale(d.date))
        .y(d => yScale(d.total));

    g.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-width", 2)
        .attr("d", line);

    // Separate Y scale for fatal (much smaller numbers)
    const yFatalScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.fatal)])
        .nice()
        .range([innerHeight, 0]);

    const fatalLine = d3.line()
        .x(d => xScale(d.date))
        .y(d => yFatalScale(d.fatal));

    g.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "red")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "4 2")
        .attr("d", fatalLine);

    // Legend (top-right)
    const legend = svg.append("g")
        .attr("transform", `translate(${margin.left + innerWidth - 180}, ${margin.top})`);
    
    legend.append("line")
        .attr("x1", 0).attr("x2", 20)
        .attr("y1", 8).attr("y2", 8)
        .attr("stroke", "steelblue").attr("stroke-width", 2);
    legend.append("text")
        .attr("x", 25).attr("y", 12)
        .attr("font-size", "11px")
        .text("Total accidents");
    
    legend.append("line")
        .attr("x1", 0).attr("x2", 20)
        .attr("y1", 28).attr("y2", 28)
        .attr("stroke", "red")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "4 2");
    legend.append("text")
        .attr("x", 25).attr("y", 32)
        .attr("font-size", "11px")
        .text("Fatal accidents");

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

            // Filter data to brushed range and extract month strings
            const selectedMonths = data
                .filter(d => d.date >= date0 && d.date <= date1)
                .map(d => d.month);

            // Update choropleth colors + stats with selected months
            updateChoroplethByMonths(selectedMonths.length > 0 ? selectedMonths : null);
        });

    // Add brush layer (on top of chart)
    g.append("g")
        .attr("class", "brush")
        .call(brush);
}