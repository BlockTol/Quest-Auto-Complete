
import { findByProps } from "@webpack";
import { Button, React, Text } from "@webpack/common";
import { ModalRoot, ModalHeader, ModalContent, ModalFooter, ModalCloseButton, openModal, ModalSize } from "@utils/modal";
import { DataStore } from "@api/index";
import { GITHUB_RELEASE_URL, PLUGIN_VERSION } from ".";

export function showUpdateModal(version: string, releaseNotes: string) {
    if (!openModal) {
        console.error("[QuestAutoComplete] Missing openModal");
        return;
    }

    const formattedNotes = releaseNotes
        .replace(/#{1,6}\s/g, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .substring(0, 500);

    const whiteText = { color: "#FFFFFF", fontWeight: 600 };

    openModal((props: any) => (
        <ModalRoot {...props} size={ModalSize.SMALL}>
            <ModalHeader separator={false}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Text variant="heading-lg/semibold" style={{ color: "#FFFFFF" }}>🚀 Update Available</Text>
                    </div>
                    <ModalCloseButton onClick={props.onClose} />
                </div>
            </ModalHeader>
            <ModalContent>
                <div style={{ paddingBottom: 16 }}>
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 16,
                        backgroundColor: "var(--background-secondary)",
                        padding: "16px",
                        borderRadius: "8px",
                        gap: "24px"
                    }}>
                        <div style={{ textAlign: "center" }}>
                            <Text variant="text-xs/bold" style={{ color: "#FFFFFF", opacity: 0.7, textTransform: "uppercase", marginBottom: "4px" }}>Current</Text>
                            <Text variant="heading-lg/bold" style={{ color: "#FFFFFF" }}>v{PLUGIN_VERSION}</Text>
                        </div>
                        <Text variant="heading-lg/bold" style={{ color: "#FFFFFF", opacity: 0.5 }}>→</Text>
                        <div style={{ textAlign: "center" }}>
                            <Text variant="text-xs/bold" style={{ color: "#FFFFFF", opacity: 0.7, textTransform: "uppercase", marginBottom: "4px" }}>New</Text>
                            <Text variant="heading-lg/bold" style={{ color: "#2dc770" }}>v{version}</Text>
                        </div>
                    </div>

                    <div style={{
                        backgroundColor: "var(--background-secondary)",
                        borderRadius: 8,
                        padding: 12,
                        border: "1px solid var(--background-modifier-accent)"
                    }}>
                        <Text variant="text-xs/bold" style={{ color: "#FFFFFF", opacity: 0.7, marginBottom: 8, textTransform: "uppercase" }}>
                            What's New in v{version}
                        </Text>
                        <Text variant="text-sm/normal" style={{ whiteSpace: "pre-wrap", color: "#FFFFFF", lineHeight: "1.5" }}>
                            {releaseNotes}
                        </Text>
                    </div>
                </div>
            </ModalContent>
            <ModalFooter>
                <div style={{ display: "flex", gap: "12px", width: "100%", alignItems: "center" }}>
                    <Button
                        look={Button.Looks.FILLED}
                        color={Button.Colors.PRIMARY}
                        onClick={() => {
                            props.onClose();
                        }}
                        style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.1)" }}
                    >
                        <span style={whiteText}>Not Now</span>
                    </Button>
                    <Button
                        onClick={() => {
                            window.open(GITHUB_RELEASE_URL, "_blank");
                            props.onClose();
                        }}
                        color={Button.Colors.GREEN}
                        style={{ flex: 1 }}
                    >
                        <span style={whiteText}>Update Now</span>
                    </Button>
                </div>
            </ModalFooter>
        </ModalRoot>
    ));
}
