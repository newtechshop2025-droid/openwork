/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { CircleAlert, Info, Download, Laptop, Monitor, Terminal } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatBytes, formatRelativeTime } from "../../../../app/utils";
import { t } from "../../../../i18n";
import type { ReleaseChannel } from "../../../../app/types";
import type { SettingsUpdateStatus } from "../state/electron-updater-state";
import {
  LayoutSectionItem,
  LayoutSectionItemDescription,
  LayoutSectionItemHeader,
  LayoutSectionItemHeaderActions,
  LayoutSectionItemTitle,
  LayoutStack,
} from "../settings-layout";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "../settings-section";

const RELEASE_CHANNEL_OPTIONS: { label: string; value: ReleaseChannel }[] = [
  { label: "Stable", value: "stable" },
  { label: "Alpha", value: "alpha" },
];

type UpdateDownloadProgressProps = {
  downloadedBytes: number | null;
  totalBytes: number | null;
};

function UpdateDownloadProgress(props: UpdateDownloadProgressProps) {
  const downloadedBytes = props.downloadedBytes ?? 0;
  const progressPercent =
    props.totalBytes != null && props.totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / props.totalBytes) * 100)) : 0;
  const progressLabel = (
    <>
      {formatBytes(downloadedBytes)}
      {props.totalBytes != null ? ` / ${formatBytes(props.totalBytes)}` : ""}
    </>
  );

  return (
    <Progress value={progressPercent} className="w-full">
      <ProgressLabel className="text-sm text-muted-foreground font-normal">{progressLabel}</ProgressLabel>
      <ProgressValue className="text-sm" />
    </Progress>
  );
}

interface ReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

interface InstallersInfo {
  macos: { appleSilicon: string; intel: string };
  windows: { x64: string };
  linux: { appImageX64: string; appImageArm64: string };
}

interface ReleaseData {
  assets?: ReleaseAsset[];
  html_url?: string;
  tag_name?: string;
}

type WebDownloadSectionProps = {
  currentVersion: string;
};

function WebDownloadSection({ currentVersion }: WebDownloadSectionProps) {
  const [detectedOs, setDetectedOs] = useState<"macos" | "windows" | "linux" | null>(null);
  const [releaseInfo, setReleaseInfo] = useState<{ tag: string; installers: InstallersInfo } | null>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes("win")) {
        setDetectedOs("windows");
      } else if (ua.includes("linux")) {
        setDetectedOs("linux");
      } else if (ua.includes("mac") || ua.includes("os x")) {
        setDetectedOs("macos");
      }
    }

    let active = true;
    fetch("https://api.github.com/repos/newtechshop2025-droid/openwork/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((release: ReleaseData | null) => {
        if (!active || !release) return;
        const assets = Array.isArray(release.assets) ? release.assets : [];
        const releaseUrl = release.html_url || "https://github.com/newtechshop2025-droid/openwork/releases";
        const releaseTag = release.tag_name || "";

        const selectAsset = (exts: string[], keywords: string[]) => {
          const match = assets.filter((asset: ReleaseAsset) => {
            if (!asset?.name || !asset?.browser_download_url) return false;
            const name = asset.name.toLowerCase();
            const extOk = exts.some((ext) => name.endsWith(ext));
            const kwOk = keywords.length === 0 || keywords.some((kw) => name.includes(kw));
            return extOk && kwOk;
          });
          if (match.length === 0) return null;
          return (
            match.find((a: ReleaseAsset) => a.name?.toLowerCase().includes("arm64")) ||
            match.find((a: ReleaseAsset) => a.name?.toLowerCase().includes("aarch64")) ||
            match[0]
          );
        };

        const macApple = selectAsset([".dmg"], ["mac-arm64"]);
        const macIntel = selectAsset([".dmg"], ["mac-x64"]);
        const dmg = selectAsset([".dmg"], ["openwork-mac-"]);
        const winX64 = selectAsset([".exe"], ["win-x64"]);
        const linuxAppX64 = selectAsset([".appimage"], ["linux-x86_64"]) || selectAsset([".appimage"], ["linux-x64"]);
        const linuxAppArm64 = selectAsset([".appimage"], ["linux-arm64"]);

        setReleaseInfo({
          tag: releaseTag,
          installers: {
            macos: {
              appleSilicon: macApple?.browser_download_url || dmg?.browser_download_url || releaseUrl,
              intel: macIntel?.browser_download_url || dmg?.browser_download_url || releaseUrl,
            },
            windows: { x64: winX64?.browser_download_url || releaseUrl },
            linux: {
              appImageX64: linuxAppX64?.browser_download_url || releaseUrl,
              appImageArm64: linuxAppArm64?.browser_download_url || releaseUrl,
            },
          },
        });
      })
      .catch(() => { });

    return () => {
      active = false;
    };
  }, []);

  const cleanVersion = currentVersion.startsWith("v") ? currentVersion : `v${currentVersion}`;
  const versionNum = currentVersion.startsWith("v") ? currentVersion.slice(1) : currentVersion;
  const githubBaseUrl = `https://github.com/different-ai/openwork/releases/download/${cleanVersion}`;

  const fallbackInstallers = {
    macos: {
      appleSilicon: `${githubBaseUrl}/openwork-mac-arm64-${versionNum}.dmg`,
      intel: `${githubBaseUrl}/openwork-mac-x64-${versionNum}.dmg`,
    },
    windows: {
      x64: `${githubBaseUrl}/openwork-win-x64-${versionNum}.exe`,
    },
    linux: {
      appImageX64: `${githubBaseUrl}/openwork-linux-x86_64-${versionNum}.AppImage`,
      appImageArm64: `${githubBaseUrl}/openwork-linux-arm64-${versionNum}.AppImage`,
    },
  };

  const installers = releaseInfo?.installers || fallbackInstallers;
  const displayTag = releaseInfo?.tag || cleanVersion;

  return (
    <LayoutStack>
      <LayoutSectionItem>
        <LayoutSectionItemHeader>
          <LayoutSectionItemTitle className="flex items-center gap-2">
            <span>Download OpenWork for Desktop</span>
            <span className="rounded-full bg-blue-2 border border-blue-6 text-blue-11 px-2.5 py-0.5 text-xs font-semibold">
              {displayTag}
            </span>
          </LayoutSectionItemTitle>
          <LayoutSectionItemDescription>
            Install the desktop application to unlock local execution, agent workflows, and native integrations.
          </LayoutSectionItemDescription>
        </LayoutSectionItemHeader>
      </LayoutSectionItem>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* macOS Card */}
        <div className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all duration-200 bg-dls-surface ${detectedOs === "macos" ? "border-blue-6 shadow-[0_0_12px_rgba(59,130,246,0.1)]" : "border-dls-border"
          }`}>
          {detectedOs === "macos" && (
            <span className="absolute top-4 right-4 rounded-full bg-[#18A34A]/10 px-2 py-0.5 text-[10px] font-semibold text-[#18A34A] border border-[#18A34A]/20">
              Detected
            </span>
          )}
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-dls-hover text-dls-text">
                <Laptop className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-dls-text">macOS</h3>
                <p className="text-xs text-dls-secondary mt-0.5">Apple Silicon or Intel</p>
              </div>
            </div>
            <p className="text-xs text-dls-secondary mt-4 leading-relaxed">
              Provides seamless voice control, computer use capabilities, and low-latency workspace agent connections.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <a
              href={installers.macos.appleSilicon}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold px-4 py-2.5 text-xs transition-colors hover:bg-primary/90 shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              Apple Silicon (M1/M2/M3)
            </a>
            <a
              href={installers.macos.intel}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-dls-border bg-dls-surface font-medium px-4 py-2.5 text-xs text-dls-text transition-colors hover:bg-dls-hover"
            >
              <Download className="h-3.5 w-3.5" />
              Intel Core
            </a>
          </div>
        </div>

        {/* Windows Card */}
        <div className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all duration-200 bg-dls-surface ${detectedOs === "windows" ? "border-blue-6 shadow-[0_0_12px_rgba(59,130,246,0.1)]" : "border-dls-border"
          }`}>
          {detectedOs === "windows" && (
            <span className="absolute top-4 right-4 rounded-full bg-[#18A34A]/10 px-2 py-0.5 text-[10px] font-semibold text-[#18A34A] border border-[#18A34A]/20">
              Detected
            </span>
          )}
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-dls-hover text-dls-text">
                <Monitor className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-dls-text">Windows</h3>
                <p className="text-xs text-dls-secondary mt-0.5">x64 architecture</p>
              </div>
            </div>
            <p className="text-xs text-dls-secondary mt-4 leading-relaxed">
              Native background server and desktop automation agent controller.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <a
              href={installers.windows.x64}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold px-4 py-2.5 text-xs transition-colors hover:bg-primary/90 shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              Download for Windows
            </a>
          </div>
        </div>

        {/* Linux Card */}
        <div className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all duration-200 bg-dls-surface ${detectedOs === "linux" ? "border-blue-6 shadow-[0_0_12px_rgba(59,130,246,0.1)]" : "border-dls-border"
          }`}>
          {detectedOs === "linux" && (
            <span className="absolute top-4 right-4 rounded-full bg-[#18A34A]/10 px-2 py-0.5 text-[10px] font-semibold text-[#18A34A] border border-[#18A34A]/20">
              Detected
            </span>
          )}
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-dls-hover text-dls-text">
                <Terminal className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-dls-text">Linux</h3>
                <p className="text-xs text-dls-secondary mt-0.5">AppImage (x86_64 or ARM64)</p>
              </div>
            </div>
            <p className="text-xs text-dls-secondary mt-4 leading-relaxed">
              Standalone AppImage binaries. Simply download, make executable, and run.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <a
              href={installers.linux.appImageX64}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold px-4 py-2.5 text-xs transition-colors hover:bg-primary/90 shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              AppImage (x64)
            </a>
            <a
              href={installers.linux.appImageArm64}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-dls-border bg-dls-surface font-medium px-4 py-2.5 text-xs text-dls-text transition-colors hover:bg-dls-hover"
            >
              <Download className="h-3.5 w-3.5" />
              AppImage (ARM64)
            </a>
          </div>
        </div>
      </div>

      <div className="text-xs text-dls-secondary mt-2">
        Looking for older versions or other platforms? Visit our{" "}
        <a
          href="https://github.com/newtechshop2025-droid/openwork/releases"
          target="_blank"
          rel="noreferrer"
          className="text-blue-11 hover:underline"
        >
          GitHub Releases page
        </a>.
      </div>
    </LayoutStack>
  );
}

export type UpdatesViewProps = {
  busy: boolean;
  webDeployment: boolean;
  appVersion: string | null;
  updateEnv: { supported?: boolean; reason?: string | null } | null;
  updateAutoCheck: boolean;
  toggleUpdateAutoCheck: () => void;
  updateAutoDownload: boolean;
  toggleUpdateAutoDownload: () => void;
  updateStatus: SettingsUpdateStatus;
  anyActiveRuns: boolean;
  checkForUpdates: () => void | Promise<void>;
  downloadUpdate: () => void | Promise<void>;
  installUpdateAndRestart: () => void | Promise<void>;
  /** Currently selected release channel. Optional; callers may omit. */
  releaseChannel?: ReleaseChannel;
  /**
   * Change the release channel. When not provided, the channel row is
   * rendered read-only — useful for contexts where the pref can't be
   * mutated (e.g. web preview).
   */
  onReleaseChannelChange?: (next: ReleaseChannel) => void;
  /**
   * Whether the alpha channel is available on this platform. Alpha is
   * macOS-only today; other platforms should receive `false` so the
   * toggle is hidden.
   */
  alphaChannelSupported?: boolean;
};

export function UpdatesView(props: UpdatesViewProps) {
  if (props.webDeployment) {
    return (
      <WebDownloadSection currentVersion={props.appVersion || String(import.meta.env.VITE_OPENWORK_APP_VERSION ?? "").trim() || "0.15.2"} />
    );
  }

  const updateState = props.updateStatus?.state ?? "idle";
  const updateVersion = props.updateStatus?.version ?? null;
  const updateDate = props.updateStatus?.date ?? null;
  const updateLastCheckedAt = props.updateStatus?.lastCheckedAt ?? null;
  const updateDownloadedBytes = props.updateStatus?.downloadedBytes ?? null;
  const updateTotalBytes = props.updateStatus?.totalBytes ?? null;
  const updateErrorMessage = props.updateStatus?.message ?? null;
  const updateNotes = props.updateStatus?.notes ?? null;

  const updateRestartBlockedMessage =
    updateState === "ready" && props.anyActiveRuns
      ? t("settings.restart_blocked_message")
      : null;

  return (
    <LayoutStack>
      {props.appVersion ? (
        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>Current version</LayoutSectionItemTitle>
            <LayoutSectionItemDescription className="font-mono">v{props.appVersion}</LayoutSectionItemDescription>
          </LayoutSectionItemHeader>
        </LayoutSectionItem>
      ) : null}
      <LayoutSectionItem>
        <LayoutSectionItemHeader>
          <LayoutSectionItemTitle>
            {updateState === "checking"
              ? t("settings.update_checking")
              : updateState === "available"
                ? t("settings.update_available_version", undefined, { version: updateVersion ?? "" })
                : updateState === "downloading"
                  ? t("settings.update_downloading")
                  : updateState === "ready"
                    ? t("settings.update_ready_version", undefined, { version: updateVersion ?? "" })
                    : updateState === "error"
                      ? t("settings.update_check_failed")
                      : t("settings.update_uptodate")}
          </LayoutSectionItemTitle>
          <LayoutSectionItemDescription>
            {updateState === "idle" && updateLastCheckedAt
              ? t("settings.update_last_checked", undefined, {
                time: formatRelativeTime(updateLastCheckedAt),
              })
              : updateState === "available" && updateDate
                ? t("settings.update_published", undefined, { date: updateDate })
                : null}
          </LayoutSectionItemDescription>
          <LayoutSectionItemHeaderActions>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => void props.checkForUpdates()}
                disabled={props.busy || updateState === "checking" || updateState === "downloading"}
              >
                {updateState === "checking" ? <Spinner className="size-4" /> : null}
                {t("settings.update_check_button")}
              </Button>

              {updateState === "available" ? (
                <Button
                  variant="secondary"
                  onClick={() => void props.downloadUpdate()}
                  disabled={props.busy}
                >
                  {t("settings.update_download_button")}
                </Button>
              ) : null}

              {updateState === "ready" ? (
                <Button
                  variant="secondary"
                  onClick={() => void props.installUpdateAndRestart()}
                  disabled={props.busy || props.anyActiveRuns}
                  title={updateRestartBlockedMessage ?? ""}
                >
                  {t("settings.update_install_button")}
                </Button>
              ) : null}
            </div>
          </LayoutSectionItemHeaderActions>
        </LayoutSectionItemHeader>

        {updateState === "downloading" ? (
          <UpdateDownloadProgress downloadedBytes={updateDownloadedBytes} totalBytes={updateTotalBytes} />
        ) : null}

        {updateState === "error" && updateErrorMessage ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{updateErrorMessage}</AlertDescription>
          </Alert>
        ) : null}

        {updateRestartBlockedMessage ? (
          <Alert>
            <Info />
            <AlertDescription>{updateRestartBlockedMessage}</AlertDescription>
          </Alert>
        ) : null}
      </LayoutSectionItem>

      {updateState === "available" && updateNotes ? (
        <LayoutSectionItem className="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
          {updateNotes}
        </LayoutSectionItem>
      ) : null}

      {props.webDeployment ? (
        <Alert>
          <AlertDescription>{t("settings.updates_desktop_only")}</AlertDescription>
        </Alert>
      ) : props.updateEnv && props.updateEnv.supported === false ? (
        <Alert>
          <AlertDescription>{props.updateEnv.reason ?? t("settings.updates_not_supported")}</AlertDescription>
        </Alert>
      ) : (
        <>
          <Separator />
          {props.alphaChannelSupported && props.releaseChannel ? (
            <LayoutSectionItem>
              <LayoutSectionItemHeader>
                <LayoutSectionItemTitle>Release channel</LayoutSectionItemTitle>
                <LayoutSectionItemDescription>
                  Stable gets fully tested releases. Alpha includes the very latest changes but may be less polished (macOS only).
                </LayoutSectionItemDescription>
                <LayoutSectionItemHeaderActions>
                  <Select
                    value={props.releaseChannel}
                    items={RELEASE_CHANNEL_OPTIONS}
                    onValueChange={(value) => {
                      if (value === "stable" || value === "alpha") {
                        props.onReleaseChannelChange?.(value);
                      }
                    }}
                    disabled={!props.onReleaseChannelChange}
                  >
                    <SelectTrigger aria-label="Release channel" className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {RELEASE_CHANNEL_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </LayoutSectionItemHeaderActions>
              </LayoutSectionItemHeader>
            </LayoutSectionItem>
          ) : null}

          <LayoutSectionItem>
            <LayoutSectionItemHeader>
              <LayoutSectionItemTitle>{t("settings.background_checks_title")}</LayoutSectionItemTitle>
              <LayoutSectionItemDescription>{t("settings.background_checks_desc")}</LayoutSectionItemDescription>
              <LayoutSectionItemHeaderActions>
                <Switch
                  aria-label={t("settings.background_checks_title")}
                  checked={props.updateAutoCheck}
                  onCheckedChange={props.toggleUpdateAutoCheck}
                />
              </LayoutSectionItemHeaderActions>
            </LayoutSectionItemHeader>
          </LayoutSectionItem>

          <LayoutSectionItem>
            <LayoutSectionItemHeader>
              <LayoutSectionItemTitle>{t("settings.auto_update_title")}</LayoutSectionItemTitle>
              <LayoutSectionItemDescription>{t("settings.auto_update_desc")}</LayoutSectionItemDescription>
              <LayoutSectionItemHeaderActions>
                <Switch
                  aria-label={t("settings.auto_update_title")}
                  checked={props.updateAutoDownload}
                  onCheckedChange={props.toggleUpdateAutoDownload}
                />
              </LayoutSectionItemHeaderActions>
            </LayoutSectionItemHeader>
          </LayoutSectionItem>


        </>
      )}
    </LayoutStack>
  );
}
