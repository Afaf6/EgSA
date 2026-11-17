import { forwardRef, useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  Decimation,
} from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, Decimation, zoomPlugin);

/* ==========================================================================
   CHART COLORS — change graph colors here
   DARK  = old look (unchanged).
   LIGHT = white plot background, light blue-gray "No test data" band with dark text,
           darker axis / legend text so everything is readable on white.
   ========================================================================== */
const CHART_COLORS = {
  dark: {
    plotBg: undefined,                       // transparent (panel shows through)
    gapFill: "rgba(148, 163, 184, 0.10)",    // "no data" band
    gapHatch: "rgba(148, 163, 184, 0.35)",   // diagonal stripes in the band
    gapEdge: "rgba(148,163,184,0.6)",        // dashed band edges
    gapText: "#9aa4bf",                      // "No test data" + dates
    legend: "#9aa4bf",
    tick: "#667089",
    grid: "rgba(255,255,255,0.05)",
    yTick: "#06b6d4",
    y1Tick: "#f59e0b",
    main: "#06b6d4",
    multi: ["#a78bfa", "#34d399", "#fb7185", "#fbbf24", "#60a5fa", "#f472b6", "#2dd4bf"],
  },
  light: {
    plotBg: "#ffffff",                       // plain white behind the graph
    gapFill: "rgba(150, 175, 205, 0.30)",     // light blue-gray "no data" band
    gapHatch: "rgba(42, 103, 159, 0.20)",     // soft blue stripes
    gapEdge: "rgba(42, 103, 159, 0.55)",      // dashed band edges
    gapText: "#2c405a",                       // dark text on the light band
    legend: "#1e293b",                       // dark text on white
    tick: "#334155",
    grid: "rgba(15, 23, 42, 0.10)",
    yTick: "#0e7490",
    y1Tick: "#b45309",
    main: "#0891b2",
    multi: ["#7c3aed", "#059669", "#e11d48", "#d97706", "#2563eb", "#db2777", "#0d9488"],
  },
};

/** true when the app is in light mode (watches <html data-theme="light"> live) */
function useIsLightTheme() {
  const read = () => typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light";
  const [isLight, setIsLight] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setIsLight(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return isLight;
}

/** Draws a hatched band + "No test data" label behind the lines for every
 *  gap range, in the chart's own pixel space — stays correct through
 *  zoom/pan since it reads the live x-scale on every redraw. */
const gapBandsPlugin = {
  id: "gapBands",
  beforeDatasetsDraw(chart) {
    const ranges = chart.options.plugins?.gapBands?.ranges;
    const c = chart.options.plugins?.gapBands?.colors || CHART_COLORS.dark;
    if (!ranges || ranges.length === 0) return;
    const { ctx, chartArea, scales } = chart;
    const xScale = scales.x;
    if (!chartArea) return;

    ctx.save();
    ranges.forEach((g) => {
      const x1 = xScale.getPixelForValue(g.startT);
      const x2 = xScale.getPixelForValue(g.endT);
      const left = Math.max(chartArea.left, Math.min(x1, x2));
      const right = Math.min(chartArea.right, Math.max(x1, x2));
      if (right <= left) return;

      ctx.fillStyle = c.gapFill;
      ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);

      // diagonal hatch
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
      ctx.clip();
      ctx.strokeStyle = c.gapHatch;
      ctx.lineWidth = 1;
      const step = 8;
      for (let x = left - (chartArea.bottom - chartArea.top); x < right; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, chartArea.bottom);
        ctx.lineTo(x + (chartArea.bottom - chartArea.top), chartArea.top);
        ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = c.gapEdge;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(left, chartArea.top);
      ctx.lineTo(left, chartArea.bottom);
      ctx.moveTo(right, chartArea.top);
      ctx.lineTo(right, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      if (right - left > 60) {
        ctx.fillStyle = c.gapText;
        ctx.font = "11px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("No test data", (left + right) / 2, chartArea.top + 14);
        const fmt = (ms) => new Date(ms).toLocaleString("en-GB", { hour12: false });
        ctx.font = "10px 'JetBrains Mono', monospace";
        ctx.fillText(`${fmt(g.startT)} → ${fmt(g.endT)}`, (left + right) / 2, chartArea.top + 27);
      }
    });
    ctx.restore();
  },
};
ChartJS.register(gapBandsPlugin);

/** Draws horizontal dashed reference lines for configured Warning and Alarm limits
 *  on the primary Y-axis, complete with labeled badges. Safe for missing/empty limits. */
const thresholdLinesPlugin = {
  id: "thresholdLines",
  afterDatasetsDraw(chart) {
    const limits = chart.options.plugins?.thresholdLines?.limits;
    if (!limits || typeof limits !== "object") return;
    const { ctx, chartArea, scales } = chart;
    const yScale = scales.y;
    if (!chartArea || !yScale) return;

    const lines = [
      { key: "alarmHigh", val: limits.alarmHigh, label: "ALARM HIGH", color: "#ef4444", dash: [6, 4] },
      { key: "warningHigh", val: limits.warningHigh ?? limits.warnHigh, label: "WARN HIGH", color: "#f59e0b", dash: [4, 4] },
      { key: "warningLow", val: limits.warningLow ?? limits.warnLow, label: "WARN LOW", color: "#f59e0b", dash: [4, 4] },
      { key: "alarmLow", val: limits.alarmLow, label: "ALARM LOW", color: "#ef4444", dash: [6, 4] },
    ];

    ctx.save();
    lines.forEach(({ val, label, color, dash }) => {
      if (val === null || val === undefined || val === "" || !Number.isFinite(Number(val))) return;
      const numVal = Number(val);
      const yPixel = yScale.getPixelForValue(numVal);
      if (yPixel < chartArea.top || yPixel > chartArea.bottom) return;

      // Draw horizontal dashed line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, yPixel);
      ctx.lineTo(chartArea.right, yPixel);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw label pill at right edge
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      const tagText = `${label} (${numVal})`;
      const textWidth = ctx.measureText(tagText).width;
      const pillW = textWidth + 8;
      const pillH = 14;
      const pillX = chartArea.right - pillW - 4;
      const pillY = yPixel - 7;

      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.fillRect(pillX, pillY, pillW, pillH);
      ctx.strokeRect(pillX, pillY, pillW, pillH);

      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(tagText, pillX + 4, yPixel);
    });
    ctx.restore();
  },
};
ChartJS.register(thresholdLinesPlugin);

/** Turns a series + its gaps into {x,y,status} points with explicit null bridge
 *  points at each gap edge, so Chart.js (spanGaps: false) breaks cleanly. */
function toGappedPoints(series, gaps) {
  const points = series.map((p) => ({
    x: new Date(p.t).getTime(),
    y: p.value,
    status: p.status || "nominal",
  }));
  gaps.forEach((g) => {
    points.push({ x: g.startT + 1, y: null, status: "gap" });
    points.push({ x: g.endT - 1, y: null, status: "gap" });
  });
  return points.sort((a, b) => a.x - b.x);
}

// eslint-disable-next-line react/display-name
const TrendChart = forwardRef(function TrendChart(
  {
    series,
    label,
    unit,
    limits,
    gaps = [],
    compareSeries,
    compareLabel,
    compareUnit,
    compareLimits,
    compareGaps = [],
    multiSeries = [],
  },
  ref
) {
  const isLight = useIsLightTheme();
  const C = isLight ? CHART_COLORS.light : CHART_COLORS.dark;
  const hasCompare = Array.isArray(compareSeries) && compareSeries.length > 0;
  const hasMultiple = Array.isArray(multiSeries) && multiSeries.length > 0;

  const data = useMemo(() => {
    const datasets = [
      {
        label: unit ? `${label} (${unit})` : label,
        data: toGappedPoints(series, gaps),
        borderColor: C.main,
        backgroundColor: isLight ? "rgba(8,145,178,0.10)" : "rgba(6,182,212,0.12)",
        pointRadius: (ctx) => {
          const point = ctx.dataset?.data?.[ctx.dataIndex];
          if (!point || point.y === null || point.status === "gap") return 0;
          if (point.status === "alarm") return 4.5;
          if (point.status === "warning") return 3.5;
          return 0;
        },
        pointBackgroundColor: (ctx) => {
          const point = ctx.dataset?.data?.[ctx.dataIndex];
          if (point?.status === "alarm") return "#ef4444";
          if (point?.status === "warning") return "#f59e0b";
          return C.main;
        },
        pointBorderColor: (ctx) => {
          const point = ctx.dataset?.data?.[ctx.dataIndex];
          if (point?.status === "alarm") return "#b91c1c";
          if (point?.status === "warning") return "#d97706";
          return "#0891b2";
        },
        pointBorderWidth: 1,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.25,
        fill: true,
        spanGaps: false,
        yAxisID: "y",
      },
    ];
    if (hasCompare) {
      datasets.push({
        label: compareUnit ? `${compareLabel} (${compareUnit})` : compareLabel,
        data: toGappedPoints(compareSeries, compareGaps),
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245,158,11,0.10)",
        pointRadius: (ctx) => {
          const point = ctx.dataset?.data?.[ctx.dataIndex];
          if (!point || point.y === null || point.status === "gap") return 0;
          if (point.status === "alarm") return 4.5;
          if (point.status === "warning") return 3.5;
          return 0;
        },
        pointBackgroundColor: (ctx) => {
          const point = ctx.dataset?.data?.[ctx.dataIndex];
          if (point?.status === "alarm") return "#ef4444";
          if (point?.status === "warning") return "#f59e0b";
          return "#f59e0b";
        },
        pointBorderColor: (ctx) => {
          const point = ctx.dataset?.data?.[ctx.dataIndex];
          if (point?.status === "alarm") return "#b91c1c";
          if (point?.status === "warning") return "#d97706";
          return "#b45309";
        },
        pointBorderWidth: 1,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.25,
        fill: false,
        spanGaps: false,
        yAxisID: "y1",
      });
    }
    multiSeries.forEach((item, index) => {
      datasets.push({
        label: item.unit ? `${item.label} (${item.unit})` : item.label,
        data: toGappedPoints(item.series || [], item.gaps || []),
        borderColor: C.multi[index % C.multi.length],
        backgroundColor: "transparent",
        pointRadius: (ctx) => {
          const point = ctx.dataset?.data?.[ctx.dataIndex];
          if (!point || point.y === null) return 0;
          if (point.status === "alarm") return 4.5;
          if (point.status === "warning") return 3.5;
          return 0;
        },
        pointBackgroundColor: (ctx) => {
          const point = ctx.dataset?.data?.[ctx.dataIndex];
          if (point?.status === "alarm") return "#ef4444";
          if (point?.status === "warning") return "#f59e0b";
          return "#64748b";
        },
        borderWidth: 2,
        tension: 0.25,
        fill: false,
        spanGaps: false,
        yAxisID: "y",
      });
    });
    return { datasets };
  }, [series, gaps, label, unit, hasCompare, compareSeries, compareGaps, compareLabel, compareUnit, multiSeries, isLight]);

  const allGapRanges = useMemo(() => [...gaps, ...compareGaps, ...multiSeries.flatMap((item) => item.gaps || [])], [gaps, compareGaps, multiSeries]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    parsing: false,
    plugins: {
      legend: { labels: { color: C.legend } },
      tooltip: {
        backgroundColor: "#161d2e",
        borderColor: "rgba(255,255,255,0.08)",
        borderWidth: 1,
        callbacks: {
          title: (items) => (items[0] ? new Date(items[0].parsed.x).toLocaleString("en-GB", { hour12: false }) : ""),
          label: (item) => {
            const val = item.parsed.y;
            const status = item.raw?.status && item.raw.status !== "nominal" ? ` [${item.raw.status.toUpperCase()}]` : "";
            return `${item.dataset.label}: ${val}${status}`;
          },
        },
      },
      decimation: {
        enabled: true,
        algorithm: "lttb",
        samples: 1500,
      },
      zoom: {
        pan: { enabled: true, mode: "x" },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
      },
      gapBands: { ranges: allGapRanges, colors: C },
      thresholdLines: { limits },
    },
    scales: {
      x: {
        type: "linear",
        ticks: {
          color: C.tick,
          maxTicksLimit: 8,
          callback: (val) => new Date(val).toLocaleTimeString("en-GB", { hour12: false }),
        },
        grid: { color: C.grid },
      },
      y: {
        position: "left",
        ticks: { color: C.yTick },
        grid: { color: C.grid },
        title: unit ? { display: true, text: unit, color: C.yTick } : undefined,
      },
      ...(!hasMultiple && hasCompare
        ? {
            y1: {
              position: "right",
              ticks: { color: C.y1Tick },
              grid: { drawOnChartArea: false },
              title: compareUnit ? { display: true, text: compareUnit, color: C.y1Tick } : undefined,
            },
          }
        : {}),
    },
  };

  return (
    <div
      style={{
        height: 280,
        boxSizing: "border-box",
        background: C.plotBg,                    // white in light mode
        borderRadius: isLight ? 10 : 0,
        padding: isLight ? "8px 6px 4px" : 0,
        border: isLight ? "1px solid rgba(38, 80, 130, 0.20)" : "none",
      }}
    >
      <Line ref={ref} data={data} options={options} />
    </div>
  );
});

export default TrendChart;