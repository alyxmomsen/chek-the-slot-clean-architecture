export interface SlotChange {
    readonly date: string;
    readonly time: string;
    readonly change: 'освободился' | 'занялся' | 'сменился артист';
    readonly artist?: string;
    readonly previousArtist?: string;
}
