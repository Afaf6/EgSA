import { isFailedEquationReading } from "../../utils/statusRepresentationHelper";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import {
  selectSelectedProject,
  selectSelectedProjectFrames,
} from "../../redux/slices/projectsSlice";
import { toStatus } from "../../utils/formatters";
import telemetryService from "../../services/telemetryService";

import FilterBar from "./components/FilterBar";
import ParameterPicker from "./components/ParameterPicker";
import GraphCard from "./components/GraphCard";

import { LineChart, RefreshCw } from "lucide-react";

const HISTORY_LIMIT = 500000;
const INVALID_SENTINEL = 327.67;

let graphSeq = 0;
const HISTORY_STATE_PREFIX = "historical-explorer-state-v1";

function readSavedPageState(projectId) {
  if (!projectId || typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(`${HISTORY_STATE_PREFIX}:${projectId}`);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function cachedGraphState(value = {}) {
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, state]) =>
      state?.main || state?.compare || state?.comparisons
        ? [[id, { main: state.main || null, compare: state.compare || null, comparisons: state.comparisons || (state.compare ? [state.compare] : []), loading: false, error: "" }]]
        : []
    )
  );
}

/**
 * Convert backend history records into chart points.
 *
 * The backend returns:
 * {
 *   frameTimestamp,
 *   parameterName,
 *   rawValue,
 *   engineeringValue,
 *   unit,
 *   limitStatus
 * }
 */
function toSeries(records, parameterName) {
  if (!Array.isArray(records)) {
    return [];
  }

  const expandedRecords = records.flatMap((record) => {
    if (!Array.isArray(record?.readings)) return [record];
    return record.readings
      .filter((reading) =>
        String(reading?.parameterName ?? reading?.name ?? "").toLowerCase() ===
        String(parameterName ?? "").toLowerCase()
      )
      .map((reading) => ({ ...record, ...reading }));
  });

  return expandedRecords
    .map((record, index) => {
      const rawTimestamp =
        record?.frameTimestamp ??
        record?.timestamp ??
        record?.receivedAt ??
        record?.createdAt;

      const timestamp = new Date(rawTimestamp).getTime();

      const candidate = isFailedEquationReading(record)
        ? null
        : record?.engineeringValue ??
          record?.rawValue ??
          record?.value;

      const numberValue =
        candidate === null ||
        candidate === undefined ||
        candidate === ""
          ? NaN
          : Number(candidate);

      const valid =
        Number.isFinite(numberValue) &&
        Math.abs(numberValue - INVALID_SENTINEL) > 1e-6;

      return {
        t: timestamp,
        epoch: timestamp,
        packetIdx: index + 1,
        value: valid ? numberValue : null,
        status: toStatus(record?.limitStatus ?? record?.status),
      };
    })
    .filter((point) => Number.isFinite(point.t));
}

function unpackHistory(response) {
  // The API client unwraps Axios responses, while some service responses also
  // unwrap the server's `data` envelope. Accept either result shape here.
  let payload = response;
  for (let depth = 0; depth < 3; depth += 1) {
    if (Array.isArray(payload)) {
      return { records: payload, total: payload.length };
    }
    if (!payload || typeof payload !== "object") break;

    const records =
      payload.records ??
      payload.history ??
      payload.results ??
      payload.items ??
      payload.data;

    if (Array.isArray(records)) {
      return {
        records,
        total:
          payload.pagination?.total ??
          payload.meta?.total ??
          payload.total ??
          records.length,
      };
    }

    payload = records;
  }
  return { records: [], total: 0 };
}

function getErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "Failed to load telemetry history."
  );
}

function fromMs(date) {
  if (!date) {
    return null;
  }

  const value = new Date(`${date}T00:00:00Z`).getTime();

  return Number.isFinite(value) ? value : null;
}

function toMs(date) {
  if (!date) {
    return null;
  }

  const value = new Date(`${date}T23:59:59.999Z`).getTime();

  return Number.isFinite(value) ? value : null;
}

function toApiDate(date, endOfDay = false) {
  if (!date) return undefined;
  const time = endOfDay ? "23:59:59.999Z" : "00:00:00.000Z";
  const value = new Date(`${date}T${time}`);
  return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
}

export default function HistoricalExplorerPage() {
  const selectedProject = useSelector(selectSelectedProject);
  const selectedProjectFrames = useSelector(selectSelectedProjectFrames);

  const projectId =
    selectedProject?.id ||
    selectedProject?._id ||
    null;
  const [initialSavedState] = useState(() => readSavedPageState(projectId));

  const [filters, setFilters] = useState({ from: "", to: "", statusFilter: "all" });

  const [graphs, setGraphs] = useState(() =>
    Array.isArray(initialSavedState?.graphs) ? initialSavedState.graphs : []
  );
  const [graphState, setGraphState] = useState(() => cachedGraphState(initialSavedState?.graphState));

  const graphsRef = useRef(graphs);

  useEffect(() => {
    graphsRef.current = graphs;
  }, [graphs]);

  const requestSeq = useRef({});

  const [savedProjectId, setSavedProjectId] = useState(projectId);

  useEffect(() => {
    if (!projectId || projectId === savedProjectId) return;
    const saved = readSavedPageState(projectId);
    setSavedProjectId(projectId);
    setFilters({ from: "", to: "", statusFilter: "all" });
    setGraphs(Array.isArray(saved?.graphs) ? saved.graphs : []);
    setGraphState(cachedGraphState(saved?.graphState));
    requestSeq.current = {};
  }, [projectId, savedProjectId]);

  useEffect(() => {
    if (!projectId || projectId !== savedProjectId) return;
    try {
      window.localStorage.setItem(
        `${HISTORY_STATE_PREFIX}:${projectId}`,
        JSON.stringify({ graphs, graphState: cachedGraphState(graphState) })
      );
    } catch {
      // The page still works when storage is unavailable or full.
    }
  }, [projectId, savedProjectId, graphs, graphState]);


  const projectName =
    selectedProject?.name ||
    selectedProject?.projectName ||
    selectedProject?.satelliteName ||
    "No Project Selected";

  const frames = Array.isArray(selectedProjectFrames)
    ? selectedProjectFrames
    : [];

  /**
   * Build the parameter list directly from the
   * selected project's configured frames.
   */
  const parameters = useMemo(() => {
    return frames.flatMap((frame) => {
      const frameId = frame?.id || frame?._id;

      if (!frameId) {
        return [];
      }

      const frameParameters = Array.isArray(
        frame?.parameters
      )
        ? frame.parameters
        : [];

      return frameParameters
        .filter((parameter) => parameter?.name)
        .map((parameter) => ({
          key: `${frameId}::${parameter.name}`,

          frameId,

          frameName:
            frame?.name || "Unnamed Frame",

          subsystem:
            frame?.subsystem ||
            frame?.subsystemName ||
            frame?.subsystemCode ||
            "Unknown",

          subsystemId:
            frame?.subsystemId ||
            frame?.subsystem?._id ||
            frame?.subsystem?._id ||
            null,

          name: parameter.name,

          parameterId: parameter.id || parameter._id || null,

          unit: parameter.unit || "",
          limits: parameter.limits || {},
        }));
    });
  }, [frames]);

  const fetchSeries = useCallback(
    async (parameter, activeFilters) => {
      const response = await telemetryService.getHistory({
        projectId,
        parameterName: parameter.name,
        frameId: parameter.frameId || undefined,
        from: toApiDate(activeFilters.from),
        to: toApiDate(activeFilters.to, true),
        status:
          activeFilters.statusFilter !== "all"
            ? activeFilters.statusFilter
            : undefined,
        limit: HISTORY_LIMIT,
      });
      const { records, total } = unpackHistory(response);

      return {
        series: toSeries(records, parameter.name),
        total,
      };
    },
    [projectId]
  );

  const loadGraph = useCallback(
    async (graph, activeFilters) => {
      if (!projectId || selectedProject?.isPlaceholder) {
        return;
      }

      const seq = (requestSeq.current[graph.id] || 0) + 1;
      requestSeq.current[graph.id] = seq;

      setGraphState((previous) => ({
        ...previous,
        [graph.id]: {
          ...(previous[graph.id] || {}),
          loading: true,
          error: "",
        },
      }));

      try {
        const compareParams = graph.compareParams || (graph.compareParam ? [graph.compareParam] : []);
        const [main, comparisons] = await Promise.all([
          fetchSeries(graph, activeFilters),
          Promise.all(compareParams.map((parameter) => fetchSeries(parameter, activeFilters))),
        ]);

        if (requestSeq.current[graph.id] !== seq) {
          return;
        }

        setGraphState((previous) => ({
          ...previous,
          [graph.id]: {
            ...(previous[graph.id] || {}),
            loading: false,
            error: "",
            main,
            comparisons,
          },
        }));
      } catch (error) {
        if (requestSeq.current[graph.id] !== seq) {
          return;
        }

        setGraphState((previous) => ({
          ...previous,
          [graph.id]: {
            ...(previous[graph.id] || {}),
            loading: false,
            error: getErrorMessage(error),
            main: previous[graph.id]?.main || {
              series: [],
              total: 0,
            },
            comparisons: previous[graph.id]?.comparisons || [],
          },
        }));
      }
    },
    [
      projectId,
      selectedProject?.isPlaceholder,
      fetchSeries,
    ]
  );

  /**
   * Reload existing graphs when the project/date/status
   * filters change.
   */
  useEffect(() => {
    if (
      !projectId ||
      projectId !== savedProjectId ||
      selectedProject?.isPlaceholder
    ) {
      return;
    }

    graphsRef.current.forEach((graph) => {
      loadGraph(graph, filters);
    });
  }, [
    projectId,
    savedProjectId,
    selectedProject?.isPlaceholder,
    filters.from,
    filters.to,
    filters.statusFilter,
    loadGraph,
  ]);

  /**
   * Add a new graph.
   */
  const addGraph = useCallback(
    (parameter) => {
      if (
        !projectId ||
        !parameter?.frameId ||
        !parameter?.name
      ) {
        return;
      }

      /*
       * Prevent adding the same parameter twice.
       */
      const alreadyExists = graphsRef.current.some(
        (graph) =>
          graph.frameId === parameter.frameId &&
          graph.name === parameter.name
      );

      if (alreadyExists) {
        return;
      }

      graphSeq += 1;

      const graph = {
        id: `g_${Date.now()}_${graphSeq}`,

        projectId,

        compareKeys: [],
        compareParams: [],

        ...parameter,
      };

      setGraphs((previous) => [
        ...previous,
        graph,
      ]);

      /*
       * Initialize graph state immediately.
       */
      setGraphState((previous) => ({
        ...previous,

        [graph.id]: {
          loading: true,
          error: "",
          main: {
            series: [],
            total: 0,
          },
          compare: null,
        },
      }));

      loadGraph(graph, filters);
    },
    [projectId, filters, loadGraph]
  );

  /**
   * Remove graph.
   */
  const removeGraph = useCallback((id) => {
    delete requestSeq.current[id];

    setGraphs((previous) =>
      previous.filter(
        (graph) => graph.id !== id
      )
    );

    setGraphState((previous) => {
      const next = {
        ...previous,
      };

      delete next[id];

      return next;
    });
  }, []);

  /**
   * Change comparison parameters.
   */
  const setCompare = useCallback(
    (id, compareKeys) => {
      const target =
        graphsRef.current.find(
          (graph) => graph.id === id
        );

      if (!target) {
        return;
      }

      const compareParams = parameters.filter((parameter) => compareKeys.includes(parameter.key));

      const updated = {
        ...target,

        compareKeys,
        compareParams,
      };

      setGraphs((previous) =>
        previous.map((graph) =>
          graph.id === id
            ? updated
            : graph
        )
      );

      loadGraph(updated, filters);
    },
    [parameters, filters, loadGraph]
  );

  /**
   * Refresh every active graph.
   */
  const refreshAllGraphs = useCallback(() => {
    graphsRef.current.forEach((graph) => {
      loadGraph(graph, filters);
    });
  }, [filters, loadGraph]);

  const anyLoading = Object.values(
    graphState
  ).some((state) => state?.loading);

  /**
   * Defensive client-side filtering.
   *
   * Backend already filters status/date,
   * but keeping this makes the UI safe if
   * a service response contains extra records.
   */
  const applyFilters = useCallback(
    (series) => {
      const safeSeries = Array.isArray(series)
        ? series
        : [];

      const lowerBound = fromMs(
        filters.from
      );

      const upperBound = toMs(
        filters.to
      );

      return safeSeries
        .filter(
          (point) =>
            (lowerBound === null ||
              point.t >= lowerBound) &&
            (upperBound === null ||
              point.t <= upperBound)
        )
        .filter(
          (point) =>
            filters.statusFilter === "all" ||
            point.status ===
              filters.statusFilter
        );
    },
    [
      filters.from,
      filters.to,
      filters.statusFilter,
    ]
  );

  /**
   * Empty state.
   */
  if (
    !selectedProject ||
    selectedProject?.isPlaceholder
  ) {
    return (
      <div className="egse-panel p-5 text-center">
        <LineChart
          size={42}
          className="mb-3 text-info opacity-50"
        />

        <h1 className="egse-heading h4 mb-2">
          Historical Telemetry Explorer
        </h1>

        <p
          className="small mb-0"
          style={{
            color:
              "var(--egse-text-muted)",
          }}
        >
          Select a project first to explore
          historical telemetry data.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* PAGE HEADER */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <div>
          <div className="d-flex align-items-center gap-2">
            <LineChart
              size={22}
              className="text-info"
            />

            <h1 className="egse-heading h4 mb-0">
              Historical Telemetry Explorer
            </h1>
          </div>

          <p
            className="small mb-0"
            style={{
              color:
                "var(--egse-text-secondary)",
            }}
          >
            Post-Flight Trend Analysis,
            Threshold Auditing & Deep
            Archival Queries · {projectName}
          </p>
        </div>

        {graphs.length > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-egse-outline d-flex align-items-center gap-1"
            onClick={refreshAllGraphs}
            disabled={anyLoading}
          >
            <RefreshCw
              size={14}
              className={
                anyLoading
                  ? "spinner-border spinner-border-sm"
                  : ""
              }
            />

            <span>
              {anyLoading
                ? "Loading..."
                : "Reload Graphs"}
            </span>
          </button>
        )}
      </div>

      {/* FILTERS */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
      />

      {/* PARAMETER PICKER */}
      <ParameterPicker
        parameters={parameters}
        onAddGraph={addGraph}
      />

      {/* NO GRAPHS */}
      {graphs.length === 0 && (
        <div
          className="egse-panel p-5 text-center small my-3"
          style={{
            color:
              "var(--egse-text-muted)",
            borderStyle: "dashed",
          }}
        >
          <LineChart
            size={36}
            className="mb-2 opacity-50 text-info"
          />

          <div className="fw-semibold mb-1">
            No Active Graphs Configured
          </div>

          <div>
            Select any subsystem parameter
            from the picker above and click
            "Add Graph" to view its historical
            telemetry trend.
          </div>
        </div>
      )}

      {/* GRAPHS */}
      {graphs.map((graph) => {
        const state =
          graphState[graph.id] || {};

        const mainSeries =
          applyFilters(
            state.main?.series || []
          );

        const compareKeys = graph.compareKeys || (graph.compareKey ? [graph.compareKey] : []);
        const comparisonParams = graph.compareParams || compareKeys.map((key) => parameters.find((parameter) => parameter.key === key)).filter(Boolean);
        const comparisonSeries = (state.comparisons || (state.compare ? [state.compare] : [])).map((comparison, index) => ({
          ...comparison,
          parameter: comparisonParams[index],
          series: applyFilters(comparison?.series || []),
        }));

        return (
          <GraphCard
            key={graph.id}
            subsystem={graph.subsystem}
            label={graph.name}
            unit={graph.unit}
            series={mainSeries}
            limits={graph.limits}
            projectId={projectId}
            frameId={graph.frameId}
            activeFilters={filters}
            total={
              state.main?.total ?? 0
            }
            limit={HISTORY_LIMIT}
            loading={Boolean(
              state.loading
            )}
            error={state.error || ""}
            compareOptions={parameters.filter(
              (parameter) =>
                parameter.key !==
                graph.key
            )}
            compareKeys={compareKeys}
            onCompareChange={(key) =>
              setCompare(
                graph.id,
                key
              )
            }
            comparisons={comparisonSeries}
            onRemove={() =>
              removeGraph(graph.id)
            }
          />
        );
      })}
    </div>
  );
}
