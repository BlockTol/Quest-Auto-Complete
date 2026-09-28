/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { IconComponent } from "@utils/types";

const Svg: IconComponent = ({ height = 16, width = 16, className, children }: any) => (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        {children}
    </svg>
);

export const QueueIcon: IconComponent = props => (
    <Svg {...props}>
        <path fill="currentColor" d="M3 5h13v2H3V5Zm0 6h9v2H3v-2Zm0 6h9v2H3v-2Zm12-1.5v6l5-3-5-3Z" />
    </Svg>
);

export const CloseIcon: IconComponent = props => (
    <Svg {...props}>
        <path fill="currentColor" d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4L13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z" />
    </Svg>
);
