import "./settings.css";
import { classNameFactory } from "@utils/css";
import { Forms, React, Select, Slider, Switch } from "@webpack/common";
import { GITHUB_RELEASE_URL, PLUGIN_VERSION, settings, UPDATE_CHECK_URL } from "../index";
import { compareVersions } from "../core/utils";
import { showUpdateModal } from "./UpdateModal";
const cl = classNameFactory("vc-questAutoComplete-settings-");
function VersionDisplay() {
    const [updateStatus, setUpdateStatus] = React.useState<string | null>(null);
    const [isChecking, setIsChecking] = React.useState(false);
    const checkUpdate = async () => {
        setIsChecking(true);
        setUpdateStatus("Checking...");
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(UPDATE_CHECK_URL, {
                signal: controller.signal,
                headers: { "Accept": "application/vnd.github.v3+json" }
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                setUpdateStatus("Failed to check");
                setIsChecking(false);
                return;
            }
            const data = await response.json();
            let latestVersion = data.tag_name || data.name || "";
            latestVersion = latestVersion.replace(/^v/i, "").trim();
            if (!latestVersion) {
                setUpdateStatus("No releases found");
                setIsChecking(false);
                return;
            }
            const comparison = compareVersions(latestVersion, PLUGIN_VERSION);
            if (comparison > 0) {
                setUpdateStatus(`Update available: v${latestVersion}`);
                setTimeout(() => {
                    showUpdateModal(latestVersion, data.body || "No release notes available.");
                }, 500);
            } else {
                setUpdateStatus("You're up to date!");
            }
        } catch (e) {
            setUpdateStatus("Check failed");
        }
        setIsChecking(false);
    };
    const getStatusColor = () => {
        if (!updateStatus) return "var(--text-muted)";
        if (updateStatus.includes("available")) return "#ffaa00";
        if (updateStatus.includes("up to date")) return "#00ff00";
        if (updateStatus.includes("failed") || updateStatus.includes("Failed")) return "#f04747";
        return "var(--text-muted)";
    };
    return (
        <div className={cl("version-container")}>
            <div className={cl("version-info")}>
                <div className={cl("version-title")} style={{ color: "#ffffff" }}>Quest Auto Complete</div>
                <div className={cl("version-subtitle")} style={{ color: "#58b9ff" }}>
                    Version: <span className={cl("version-number")} style={{ color: "#58b9ff" }}>v{PLUGIN_VERSION}</span>
                    {updateStatus && (
                        <span className={cl("version-status")} style={{ color: getStatusColor() }}>
                            &nbsp;• {updateStatus}
                        </span>
                    )}
                </div>
            </div>
            <button
                className={cl("check-update-btn")}
                onClick={checkUpdate}
                disabled={isChecking}
            >
                {isChecking ? "Checking..." : "Check for Updates"}
            </button>
        </div>
    );
}
const COLOR_OPTIONS = [
    { label: "Discord Blue", value: "#5865F2" },
    { label: "Green", value: "#43b581" },
    { label: "Purple", value: "#9b59b6" },
    { label: "Orange", value: "#e67e22" },
    { label: "Red", value: "#e74c3c" },
    { label: "Pink", value: "#e91e63" },
    { label: "Cyan", value: "#00bcd4" },
    { label: "Gold", value: "#f1c40f" },
];
function SettingSwitch({ settingKey, label, note }: { settingKey: string; label: string; note?: string; }) {
    const value = settings.use([settingKey as any])[settingKey];
    const SwitchComponent = Switch as any;
    return (
        <div className={cl("setting-item")}>
            <SwitchComponent
                value={value}
                onChange={(v: boolean) => settings.store[settingKey] = v}
                note={note}
                hideBorder={true}
            >
                {label}
            </SwitchComponent>
        </div>
    );
}
function SettingSlider({ settingKey, label, note, min, max, markers }: {
    settingKey: string;
    label: string;
    note?: string;
    min: number;
    max: number;
    markers?: number[];
}) {
    const value = settings.use([settingKey as any])[settingKey];
    return (
        <div className={cl("setting-item")}>
            <Forms.FormTitle>{label}</Forms.FormTitle>
            {note && <Forms.FormText style={{ marginBottom: 8 }}>{note}</Forms.FormText>}
            <Slider
                initialValue={value}
                onValueChange={(v: number) => settings.store[settingKey] = v}
                minValue={min}
                maxValue={max}
                markers={markers}
                onValueRender={(v: number) => `${v}s`}
            />
        </div>
    );
}
function SettingColorSelect({ settingKey, label, note }: { settingKey: string; label: string; note?: string; }) {
    const value = settings.use([settingKey as any])[settingKey];
    return (
        <div className={cl("setting-item")}>
            <Forms.FormTitle>{label}</Forms.FormTitle>
            {note && <Forms.FormText style={{ marginBottom: 8 }}>{note}</Forms.FormText>}
            <Select
                options={COLOR_OPTIONS}
                select={(v: string) => settings.store[settingKey] = v}
                isSelected={(v: string) => v === value}
                serialize={(v: string) => v}
            />
            <div className={cl("color-preview")} style={{ backgroundColor: value }} />
        </div>
    );
}
export function QuestSettings() {
    return (
        <div className={cl("root")}>
            <VersionDisplay />
        </div>
    );
}
