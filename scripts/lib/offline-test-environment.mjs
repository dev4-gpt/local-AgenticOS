export function offlineTestEnvironment(host, fallbackHome) {
  return {
    PATH: host.PATH || "/usr/bin:/bin",
    HOME: host.HOME || fallbackHome,
    TMPDIR: host.TMPDIR || "/tmp",
    LANG: host.LANG || "C.UTF-8",
    CI: "1",
    NODE_ENV: "test",
  };
}
