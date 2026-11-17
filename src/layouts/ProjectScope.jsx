import { useEffect, useState, useRef, useCallback } from "react";
import { Navigate, Outlet, useParams, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  selectProjects,
  selectSelectedProjectId,
  selectCurrentProject,
  selectProjectsLoading,
  selectProjectsHasFetched,
  selectLoadingProjectIds,
  selectProjectErrors,
  selectHydratedProjectIds,
  setSelectedProjectId,
  fetchProjectById,
  fetchProjects,
} from "../redux/slices/projectsSlice";

export default function ProjectScope() {
  const { projectId } = useParams();
  const dispatch = useDispatch();
  const projects = useSelector(selectProjects);
  const selectedProjectId = useSelector(selectSelectedProjectId);
  const currentProject = useSelector(selectCurrentProject);
  const projectsLoading = useSelector(selectProjectsLoading);
  const hasFetched = useSelector(selectProjectsHasFetched);
  const loadingProjectIds = useSelector(selectLoadingProjectIds);
  const projectErrors = useSelector(selectProjectErrors);
  const hydratedProjectIds = useSelector(selectHydratedProjectIds);

  const [isResolving, setIsResolving] = useState(false);
  const [resolveFailed, setResolveFailed] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const project =
    projects.find((item) => (item.id || item._id) === projectId) ||
    ((currentProject?._id || currentProject?.id) === projectId ? currentProject : null);

  const curId = currentProject?._id || currentProject?.id;
  const isThisProjectLoading = Boolean(projectId && loadingProjectIds[String(projectId)]);
  const thisProjectError = projectId ? projectErrors[String(projectId)] : null;
  const isHydrated = Boolean(project) && String(curId) === String(projectId) && Boolean(hydratedProjectIds[String(projectId)]);
  const isHydrationError = Boolean(project) && Boolean(thisProjectError);

  // Reset resolution states if projectId param changes
  useEffect(() => {
    setIsResolving(false);
    setResolveFailed(false);
  }, [projectId]);

  // Keep selectedProjectId in sync with route projectId parameter
  useEffect(() => {
    if (projectId && selectedProjectId !== projectId) {
      dispatch(setSelectedProjectId(projectId));
    }
  }, [projectId, selectedProjectId, dispatch]);

  // If projects list has not been fetched yet and is not currently loading, trigger initial fetch
  useEffect(() => {
    if (!hasFetched && !projectsLoading) {
      dispatch(fetchProjects());
    }
  }, [hasFetched, projectsLoading, dispatch]);

  // DEF-WATCH-2: If projects list has completed initial fetch but projectId is not in page 1 (>100 projects),
  // attempt to resolve via getProjectById / fetchProjectById before deciding to redirect
  useEffect(() => {
    if (hasFetched && !projectsLoading && !project && !isResolving && !resolveFailed && projectId) {
      setIsResolving(true);
      dispatch(fetchProjectById(projectId))
        .unwrap()
        .then(() => {
          if (mountedRef.current) {
            setIsResolving(false);
          }
        })
        .catch(() => {
          if (mountedRef.current) {
            setIsResolving(false);
            setResolveFailed(true);
          }
        });
    }
  }, [hasFetched, projectsLoading, project, isResolving, resolveFailed, projectId, dispatch]);

  useEffect(() => {
    if (project) {
      const pid = project.id || project._id;
      const activeCurrentId = currentProject?._id || currentProject?.id;
      const isThisHydrated = Boolean(pid && hydratedProjectIds[String(pid)] && String(activeCurrentId) === String(pid));
      const isThisLoading = Boolean(pid && loadingProjectIds[String(pid)]);
      const hasThisError = Boolean(pid && projectErrors[String(pid)]);
      if (!isThisHydrated && !isThisLoading && !hasThisError) {
        dispatch(fetchProjectById(pid));
      }
    }
  }, [project, currentProject?._id, currentProject?.id, loadingProjectIds, projectErrors, hydratedProjectIds, dispatch]);

  const handleRetry = useCallback(() => {
    if (projectId) {
      dispatch(fetchProjectById({ projectId, force: true }));
    }
  }, [projectId, dispatch]);

  // Once resolution has failed (project truly nonexistent in DB): redirect to dashboard
  if (!project && resolveFailed) {
    return <Navigate to="/dashboard" replace />;
  }

  // Failed hydration error state with retry button (for existing projects)
  if (isHydrationError) {
    return (
      <div className="container py-5 d-flex align-items-center justify-content-center" style={{ minHeight: "50vh" }}>
        <div className="egse-panel p-4 text-center mx-auto" style={{ maxWidth: "560px", width: "100%" }} role="alert">
          <div
            className="p-3 rounded-circle mb-3 d-inline-flex align-items-center justify-content-center"
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              color: "var(--egse-alarm, #ef4444)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
            }}
          >
            <AlertTriangle size={36} />
          </div>
          <h2 className="h5 fw-bold mb-2">Failed to load project configuration</h2>
          <p className="text-muted small mb-3">
            {thisProjectError || "Could not retrieve the full satellite telemetry configuration for this mission."}
          </p>
          <div className="d-flex justify-content-center gap-2">
            <button
              className="btn btn-sm btn-info d-inline-flex align-items-center gap-1"
              onClick={handleRetry}
            >
              <RefreshCw size={14} />
              Retry
            </button>
            <Link to="/dashboard" className="btn btn-sm btn-outline-secondary">
              Mission Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // While projects are fetching, initial fetch hasn't completed, resolving projectId, or hydrating configuration, show loading spinner
  if (!hasFetched || projectsLoading || isResolving || (!project && !resolveFailed) || !isHydrated) {
    return (
      <div className="d-flex align-items-center justify-content-center p-5" style={{ minHeight: "50vh" }}>
        <div className="spinner-border text-info" role="status">
          <span className="visually-hidden">Loading project...</span>
        </div>
      </div>
    );
  }

  if (selectedProjectId !== (project.id || project._id)) return null;
  return <Outlet key={project.id || project._id} />;
}