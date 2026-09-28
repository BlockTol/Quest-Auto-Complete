/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findComponentByCodeLazy } from "@webpack";
import type { ComponentType, CSSProperties, MouseEventHandler, ReactNode, Ref } from "react";

export interface DiscordButtonProps {
    variant?: "primary" | "secondary" | "critical-primary" | "critical-secondary" | "overlay-primary" | "overlay-secondary";
    size?: "xs" | "sm" | "md";
    text?: ReactNode;
    icon?: ComponentType<any>;
    iconPosition?: "start" | "end";
    fullWidth?: boolean;
    loading?: boolean;
    disabled?: boolean;
    buttonRef?: Ref<HTMLElement>;
    onClick?: MouseEventHandler<HTMLElement>;

    [prop: `aria-${string}`]: unknown;
    onMouseDown?: MouseEventHandler<HTMLElement>;
    onKeyDown?: (event: any) => void;
}

export const DiscordButton: ComponentType<DiscordButtonProps> = findComponentByCodeLazy('"data-mana-component":"button"');

export interface DiscordTextProps {
    variant: string;

    color?: string;
    tag?: string;
    lineClamp?: number;
    id?: string;
    className?: string;
    style?: CSSProperties;
    children?: ReactNode;
}

export const DiscordText: ComponentType<DiscordTextProps> = findComponentByCodeLazy('"data-text-variant"');

export interface DiscordSwitchProps {
    checked: boolean;
    onChange?(checked: boolean): void;
    disabled?: boolean;
    labelledBy?: string;
    id?: string;
}

export const DiscordSwitch: ComponentType<DiscordSwitchProps> = findComponentByCodeLazy("SWITCH_BACKGROUND_");
