// Capabilities a non-Electron host (the C# desktop and mobile shells) declares through
// window.__cairnHost before the renderer starts. A missing flag means "supported", so
// Electron, which sets no such object, keeps every feature.
interface CairnHost {
  canPickFolder?: boolean;
}

/** Whether the host can show a directory picker, which is what "link an existing folder" needs. */
export function canPickFolder(): boolean {
  return (window as { __cairnHost?: CairnHost }).__cairnHost?.canPickFolder !== false;
}
