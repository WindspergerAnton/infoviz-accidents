let choroplethSvg;
let allRegionData = [];
let regionMonthlyData = [];   // per-region per-month rows
let currentDataMap = null;     // currently active lookup (region name → aggregated row)
let mapWidth = 550;
let mapHeight = 600;
let accidentPoints = null;     // loaded on first region click
let activeRegion = null;       // currently zoomed region name (null = overview)
let mapProjection = null;      // stored for projecting accident points
let mapPath = null;
let mapZoom = null;            // d3.zoom behavior instance

// Normalize GeoJSON names to match CSV police_force names
const nameFixMap = {
    "Devon & Cornwall": "Devon and Cornwall",
    "London, City of": "City of London"
};
function getRegionName(d) {
    const raw = d.properties.PFA22NM;
    return nameFixMap[raw] || raw;
}

function initChoropleth(regionData, regionMonthly) {
    allRegionData = regionData;
    regionMonthlyData = regionMonthly;

    // Build initial lookup from overall totals
    currentDataMap = new Map(regionData.map(d => [d.police_force, d]));

    const svg = d3.select("#svg_map")
        .attr("width", mapWidth)
        .attr("height", mapHeight)
        .style("overflow", "hidden");
    choroplethSvg = svg;

    d3.json("/static/data/uk-police.json").then(function(uk) {
        const features = uk.features;

        const projection = d3.geoIdentity()
            .reflectY(true)
            .fitSize([mapWidth, mapHeight], uk);
        mapProjection = projection;

        const path = d3.geoPath().projection(projection);
        mapPath = path;

        // Color scale based on severity index
        const values = regionData
            .map(d => d.severity_index_per_1000)
            .filter(v => v != null);
        
        const colorScale = d3.scaleSequential()
            .domain(d3.extent(values))
            .interpolator(d3.interpolateYlOrRd);

        // Store scale globally so updateChoroplethByMonths can reuse it
        window._mapColorScale = colorScale;

        // Draw regions
        svg.append("g")
            .attr("id", "regions-group")
            .selectAll("path")
            .data(features)
            .join("path")
            .attr("class", "region-path")
            .attr("d", path)
            .attr("stroke", "#666")
            .attr("stroke-width", 0.5)
            .attr("fill", d => {
                const row = currentDataMap.get(getRegionName(d));
                return row ? colorScale(row.severity_index_per_1000) : "#ccc";
            })
            .on("mouseover", function(event, d) {
                const name = getRegionName(d);
                const row = currentDataMap.get(name);
                
                d3.select(this)
                    .attr("stroke-width", 2)
                    .attr("stroke", "#000");
                
                const tooltip = d3.select("#tooltip");
                if (row) {
                    tooltip.html(`
                        <strong>${name}</strong><br/>
                        Total accidents: ${row.total_accidents.toLocaleString()}<br/>
                        Fatal: ${row.fatal_count.toLocaleString()}<br/>
                        Serious: ${row.serious_count.toLocaleString()}<br/>
                        Slight: ${row.slight_count.toLocaleString()}<br/>
                        Severity index: ${row.severity_index_per_1000.toFixed(1)}
                    `)
                    .style("display", "block")
                    .style("left", (event.pageX + 12) + "px")
                    .style("top", (event.pageY - 10) + "px");
                } else {
                    tooltip.html(`<strong>${name}</strong><br/>No data`)
                        .style("display", "block")
                        .style("left", (event.pageX + 12) + "px")
                        .style("top", (event.pageY - 10) + "px");
                }
            })
            .on("mousemove", function(event) {
                d3.select("#tooltip")
                    .style("left", (event.pageX + 12) + "px")
                    .style("top", (event.pageY - 10) + "px");
            })
            .on("mouseout", function() {
                d3.select(this)
                    .attr("stroke-width", 0.5)
                    .attr("stroke", "#666");
                d3.select("#tooltip").style("display", "none");
            })
            .on("click", function(event, d) {
                event.stopPropagation();
                const name = getRegionName(d);
                if (activeRegion === name) {
                    // Click same region again → zoom out
                    zoomToOverview(svg, features, path);
                } else {
                    zoomToRegion(svg, d, name, features, path);
                }
            });

        // Points layer (above regions)
        svg.append("g").attr("id", "points-group");

        // ── d3.zoom: scroll to zoom, drag to pan ──────────────────
        const zoom = mapZoom = d3.zoom()
            .scaleExtent([1, 12])
            .translateExtent([[0, 0], [mapWidth, mapHeight]])
            .on("zoom", function(event) {
                const { transform } = event;
                svg.select("#regions-group").attr("transform", transform);
                svg.select("#points-group").attr("transform", transform);

                // Adjust stroke width so borders don't get fat on zoom
                d3.selectAll(".region-path")
                    .attr("stroke-width", 0.5 / transform.k);

                // Show/hide points based on zoom level
                const ZOOM_THRESHOLD = 2.5;
                if (transform.k >= ZOOM_THRESHOLD) {
                    showPointsInView(svg, transform);
                } else {
                    svg.select("#points-group").selectAll("*").remove();
                    activeRegion = null;
                    d3.selectAll(".region-path").attr("opacity", 1);
                    d3.select("#btn_reset_zoom").style("display", "none");
                }
            });

        svg.call(zoom);

        // Click region → zoom to fit it
        function clickRegion(event, d) {
            event.stopPropagation();

            const [[x0, y0], [x1, y1]] = path.bounds(d);
            const dx = x1 - x0, dy = y1 - y0;
            const x = (x0 + x1) / 2, y = (y0 + y1) / 2;
            const scale = Math.max(1, Math.min(8, 0.85 / Math.max(dx / mapWidth, dy / mapHeight)));
            const t = d3.zoomIdentity.translate(mapWidth / 2, mapHeight / 2).scale(scale).translate(-x, -y);

            svg.transition().duration(600).call(zoom.transform, t);
        }

        d3.selectAll(".region-path").on("click", clickRegion);

        // Reset button → zoom back to 1:1
        d3.select("#btn_reset_zoom").on("click", function() {
            svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
        });

        // Double-click to reset (standard map convention)
        svg.on("dblclick.zoom", null); // disable default d3 double-click zoom
        svg.on("dblclick", function() {
            svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
        });

        drawMapLegend(colorScale, d3.extent(values));
    });
}


/**
 * Called from time series brush.
 * @param {string[]|null} selectedMonths - array of month strings like ["2023-01","2023-02"], or null for all
 */
function updateChoroplethByMonths(selectedMonths) {
    let aggregated;

    if (!selectedMonths) {
        // Reset to overall totals
        aggregated = new Map(allRegionData.map(d => [d.police_force, d]));
    } else {
        // Filter region_monthly rows by selected months, then aggregate per region
        const monthSet = new Set(selectedMonths);
        const filtered = regionMonthlyData.filter(d => monthSet.has(d.month));

        const byRegion = d3.rollup(
            filtered,
            rows => ({
                total_accidents: d3.sum(rows, r => +r.total_accidents),
                fatal_count:     d3.sum(rows, r => +r.fatal_count),
                serious_count:   d3.sum(rows, r => +r.serious_count),
                slight_count:    d3.sum(rows, r => +r.slight_count),
                severity_index:  d3.sum(rows, r => +r.severity_index),
            }),
            d => d.police_force
        );

        aggregated = new Map();
        byRegion.forEach((val, key) => {
            val.police_force = key;
            val.severity_index_per_1000 = val.total_accidents > 0
                ? +(val.severity_index / val.total_accidents * 1000).toFixed(2)
                : 0;
            aggregated.set(key, val);
        });
    }

    // Update the shared lookup (used by hover tooltips)
    currentDataMap = aggregated;

    // Recolor map paths
    const colorScale = window._mapColorScale;
    d3.selectAll(".region-path")
        .transition().duration(300)
        .attr("fill", d => {
            const row = currentDataMap.get(getRegionName(d));
            return row ? colorScale(row.severity_index_per_1000) : "#ccc";
        });

    // Update stats panel
    const total = d3.sum([...aggregated.values()], d => d.total_accidents);
    const fatal = d3.sum([...aggregated.values()], d => d.fatal_count);
    const serious = d3.sum([...aggregated.values()], d => d.serious_count);
    const slight = d3.sum([...aggregated.values()], d => d.slight_count);

    let dateRange = "All months";
    if (selectedMonths && selectedMonths.length > 0) {
        const sorted = [...selectedMonths].sort();
        dateRange = `${sorted[0]} → ${sorted[sorted.length - 1]}`;
    }

    d3.select("#stats_content").html(`
        <div class="stat"><strong>Period:</strong> ${dateRange}</div>
        <div class="stat"><strong>Months selected:</strong> ${selectedMonths ? selectedMonths.length : 12}</div>
        <div class="stat"><strong>Total accidents:</strong> ${total.toLocaleString()}</div>
        <div class="stat"><strong>Fatal:</strong> ${fatal.toLocaleString()}</div>
        <div class="stat"><strong>Serious:</strong> ${serious.toLocaleString()}</div>
        <div class="stat"><strong>Slight:</strong> ${slight.toLocaleString()}</div>
    `);
}


// ── Severity color for individual dots ──────────────────────────────
const severityColor = { "Fatal": "#d32f2f", "Serious": "#ff9800", "Slight": "#4caf50" };

/**
 * Show accident dots when zoomed in far enough.
 * Finds which regions overlap the visible viewport and renders their points.
 */
function showPointsInView(svg, transform) {
    d3.select("#btn_reset_zoom").style("display", "inline-block");

    // Determine visible viewport in data coordinates
    const x0 = -transform.x / transform.k;
    const y0 = -transform.y / transform.k;
    const x1 = (mapWidth - transform.x) / transform.k;
    const y1 = (mapHeight - transform.y) / transform.k;

    // Find which regions are in view (by centroid)
    const visibleRegions = new Set();
    d3.selectAll(".region-path").each(function(d) {
        const [cx, cy] = mapPath.centroid(d);
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) {
            visibleRegions.add(getRegionName(d));
        }
    });

    // Highlight visible regions
    d3.selectAll(".region-path")
        .attr("opacity", d => visibleRegions.has(getRegionName(d)) ? 1 : 0.3);

    function doRender() {
        const pts = accidentPoints.filter(d => visibleRegions.has(d.police_force));
        const g = svg.select("#points-group");
        const radius = Math.max(0.6, 2.5 / transform.k);

        // Use data join so we don't redraw everything on every zoom event
        g.selectAll("circle")
            .data(pts, d => d.easting + "," + d.northing)
            .join(
                enter => enter.append("circle")
                    .attr("cx", d => mapProjection([d.easting, d.northing])[0])
                    .attr("cy", d => mapProjection([d.easting, d.northing])[1])
                    .attr("r", radius)
                    .attr("fill", d => severityColor[d.severity] || "#999")
                    .attr("opacity", 0.7)
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 0.3 / transform.k)
                    .on("mouseover", function(event, d) {
                        d3.select(this).attr("r", radius * 2.5).attr("opacity", 1);
                        d3.select("#tooltip")
                            .html(`
                                <strong>${d.severity}</strong><br/>
                                Date: ${d.date}<br/>
                                Speed limit: ${d.speed_limit} mph<br/>
                                Weather: ${d.weather}<br/>
                                Light: ${d.light}<br/>
                                Road: ${d.road_type}
                            `)
                            .style("display", "block")
                            .style("left", (event.pageX + 12) + "px")
                            .style("top", (event.pageY - 10) + "px");
                    })
                    .on("mousemove", function(event) {
                        d3.select("#tooltip")
                            .style("left", (event.pageX + 12) + "px")
                            .style("top", (event.pageY - 10) + "px");
                    })
                    .on("mouseout", function() {
                        d3.select(this).attr("r", radius).attr("opacity", 0.7);
                        d3.select("#tooltip").style("display", "none");
                    }),
                update => update
                    .attr("r", radius)
                    .attr("stroke-width", 0.3 / transform.k),
                exit => exit.remove()
            );
    }

    // Load points on first zoom-in
    if (!accidentPoints) {
        d3.json("/static/data/accident_points.json").then(function(pts) {
            accidentPoints = pts;
            doRender();
        });
    } else {
        doRender();
    }
}


function drawMapLegend(colorScale, extent) {
    const legendWidth = 220;
    const legendHeight = 12;

    const legendSvg = d3.select("#map_legend")
        .append("svg")
        .attr("width", legendWidth + 40)
        .attr("height", 60);

    // Create gradient
    const defs = legendSvg.append("defs");
    const grad = defs.append("linearGradient")
        .attr("id", "map-legend-gradient");

    grad.selectAll("stop")
        .data([
            { offset: "0%",   color: colorScale(extent[0]) },
            { offset: "50%",  color: colorScale((extent[0] + extent[1]) / 2) },
            { offset: "100%", color: colorScale(extent[1]) }
        ])
        .join("stop")
        .attr("offset", d => d.offset)
        .attr("stop-color", d => d.color);

    legendSvg.append("text")
        .attr("x", 20 + legendWidth / 2)
        .attr("y", 12)
        .attr("text-anchor", "middle")
        .attr("font-size", "11px")
        .attr("font-weight", "bold")
        .text("Severity Index per 1000 accidents");

    // Color bar
    legendSvg.append("rect")
        .attr("x", 20)
        .attr("y", 20)
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .style("fill", "url(#map-legend-gradient)");

    // Min/Max labels
    legendSvg.append("text")
        .attr("x", 20)
        .attr("y", 48)
        .attr("font-size", "10px")
        .text(extent[0].toFixed(1));

    legendSvg.append("text")
        .attr("x", 20 + legendWidth)
        .attr("y", 48)
        .attr("text-anchor", "end")
        .attr("font-size", "10px")
        .text(extent[1].toFixed(1));
}