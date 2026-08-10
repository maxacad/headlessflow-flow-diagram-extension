import React from 'react';
import { Position } from '@xyflow/react';
export interface HandleDef {
    type: 'source' | 'target';
    position: Position;
    id: string;
}
export interface BaseNodeProps {
    selected: boolean;
    icon: React.ReactNode;
    label: string;
    subtitle?: string;
    handles: HandleDef[];
    accentColor: string;
    transparentInner?: boolean;
    children?: React.ReactNode;
    nodeId?: string;
    rotation?: 0 | 90 | 180 | 270;
    onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
    onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
    onDoubleClick?: React.MouseEventHandler<HTMLDivElement>;
    onClick?: React.MouseEventHandler<HTMLDivElement>;
}
export declare const NodeWrapper: import("styled-components/dist/types").IStyledComponentBase<"web", import("styled-components").FastOmit<import("styled-components").FastOmit<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "$width" | "$height"> & {
    $width?: number;
    $height?: number;
}, never> & Partial<Pick<import("styled-components").FastOmit<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "$width" | "$height"> & {
    $width?: number;
    $height?: number;
}, never>>> & string;
export declare const NodeInner: import("styled-components/dist/types").IStyledComponentBase<"web", import("styled-components").FastOmit<import("styled-components").FastOmit<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "$selected" | "$accentColor" | "$transparent"> & {
    $selected: boolean;
    $accentColor: string;
    $transparent?: boolean;
}, never> & Partial<Pick<import("styled-components").FastOmit<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "$selected" | "$accentColor" | "$transparent"> & {
    $selected: boolean;
    $accentColor: string;
    $transparent?: boolean;
}, never>>> & string;
export declare const NodeIcon: import("styled-components/dist/types").IStyledComponentBase<"web", import("styled-components").FastOmit<import("styled-components").FastOmit<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "$color"> & {
    $color: string;
}, never> & Partial<Pick<import("styled-components").FastOmit<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "$color"> & {
    $color: string;
}, never>>> & string;
export declare const NodeLabel: import("styled-components/dist/types").IStyledComponentBase<"web", import("styled-components").FastOmit<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, never> & Partial<Pick<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, never>>> & string;
export declare const NodeSubtitle: import("styled-components/dist/types").IStyledComponentBase<"web", import("styled-components").FastOmit<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, never> & Partial<Pick<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, never>>> & string;
export declare const TopHandle: import("styled-components/dist/types").IStyledComponentBase<"web", import("styled-components").FastOmit<Omit<import("@xyflow/system").HandleProps & Omit<React.HTMLAttributes<HTMLDivElement>, "id"> & {
    onConnect?: import("@xyflow/react").OnConnect;
} & React.RefAttributes<HTMLDivElement>, "ref"> & {
    ref?: ((instance: HTMLDivElement | null) => void | React.DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES[keyof React.DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES]) | React.RefObject<HTMLDivElement> | null | undefined;
}, never> & Partial<Pick<Omit<import("@xyflow/system").HandleProps & Omit<React.HTMLAttributes<HTMLDivElement>, "id"> & {
    onConnect?: import("@xyflow/react").OnConnect;
} & React.RefAttributes<HTMLDivElement>, "ref"> & {
    ref?: ((instance: HTMLDivElement | null) => void | React.DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES[keyof React.DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES]) | React.RefObject<HTMLDivElement> | null | undefined;
}, never>>> & string & Omit<React.MemoExoticComponent<(props: import("@xyflow/system").HandleProps & Omit<React.HTMLAttributes<HTMLDivElement>, "id"> & {
    onConnect?: import("@xyflow/react").OnConnect;
} & import("react").RefAttributes<HTMLDivElement>) => import("react").JSX.Element>, keyof React.Component<any, {}, any>>;
export declare const BottomHandle: import("styled-components/dist/types").IStyledComponentBase<"web", import("styled-components").FastOmit<Omit<import("@xyflow/system").HandleProps & Omit<React.HTMLAttributes<HTMLDivElement>, "id"> & {
    onConnect?: import("@xyflow/react").OnConnect;
} & React.RefAttributes<HTMLDivElement>, "ref"> & {
    ref?: ((instance: HTMLDivElement | null) => void | React.DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES[keyof React.DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES]) | React.RefObject<HTMLDivElement> | null | undefined;
}, never> & Partial<Pick<Omit<import("@xyflow/system").HandleProps & Omit<React.HTMLAttributes<HTMLDivElement>, "id"> & {
    onConnect?: import("@xyflow/react").OnConnect;
} & React.RefAttributes<HTMLDivElement>, "ref"> & {
    ref?: ((instance: HTMLDivElement | null) => void | React.DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES[keyof React.DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES]) | React.RefObject<HTMLDivElement> | null | undefined;
}, never>>> & string & Omit<React.MemoExoticComponent<(props: import("@xyflow/system").HandleProps & Omit<React.HTMLAttributes<HTMLDivElement>, "id"> & {
    onConnect?: import("@xyflow/react").OnConnect;
} & import("react").RefAttributes<HTMLDivElement>) => import("react").JSX.Element>, keyof React.Component<any, {}, any>>;
export declare const RightHandle: import("styled-components/dist/types").IStyledComponentBase<"web", import("styled-components").FastOmit<Omit<import("@xyflow/system").HandleProps & Omit<React.HTMLAttributes<HTMLDivElement>, "id"> & {
    onConnect?: import("@xyflow/react").OnConnect;
} & React.RefAttributes<HTMLDivElement>, "ref"> & {
    ref?: ((instance: HTMLDivElement | null) => void | React.DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES[keyof React.DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES]) | React.RefObject<HTMLDivElement> | null | undefined;
}, never> & Partial<Pick<Omit<import("@xyflow/system").HandleProps & Omit<React.HTMLAttributes<HTMLDivElement>, "id"> & {
    onConnect?: import("@xyflow/react").OnConnect;
} & React.RefAttributes<HTMLDivElement>, "ref"> & {
    ref?: ((instance: HTMLDivElement | null) => void | React.DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES[keyof React.DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES]) | React.RefObject<HTMLDivElement> | null | undefined;
}, never>>> & string & Omit<React.MemoExoticComponent<(props: import("@xyflow/system").HandleProps & Omit<React.HTMLAttributes<HTMLDivElement>, "id"> & {
    onConnect?: import("@xyflow/react").OnConnect;
} & import("react").RefAttributes<HTMLDivElement>) => import("react").JSX.Element>, keyof React.Component<any, {}, any>>;
export declare const LeftHandle: import("styled-components/dist/types").IStyledComponentBase<"web", import("styled-components").FastOmit<Omit<import("@xyflow/system").HandleProps & Omit<React.HTMLAttributes<HTMLDivElement>, "id"> & {
    onConnect?: import("@xyflow/react").OnConnect;
} & React.RefAttributes<HTMLDivElement>, "ref"> & {
    ref?: ((instance: HTMLDivElement | null) => void | React.DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES[keyof React.DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES]) | React.RefObject<HTMLDivElement> | null | undefined;
}, never> & Partial<Pick<Omit<import("@xyflow/system").HandleProps & Omit<React.HTMLAttributes<HTMLDivElement>, "id"> & {
    onConnect?: import("@xyflow/react").OnConnect;
} & React.RefAttributes<HTMLDivElement>, "ref"> & {
    ref?: ((instance: HTMLDivElement | null) => void | React.DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES[keyof React.DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES]) | React.RefObject<HTMLDivElement> | null | undefined;
}, never>>> & string & Omit<React.MemoExoticComponent<(props: import("@xyflow/system").HandleProps & Omit<React.HTMLAttributes<HTMLDivElement>, "id"> & {
    onConnect?: import("@xyflow/react").OnConnect;
} & import("react").RefAttributes<HTMLDivElement>) => import("react").JSX.Element>, keyof React.Component<any, {}, any>>;
export declare function BaseNode({ selected, icon, label, subtitle, handles, accentColor, transparentInner, children, nodeId, rotation, onMouseEnter, onMouseLeave, onDoubleClick, onClick }: BaseNodeProps): import("react/jsx-runtime").JSX.Element;
