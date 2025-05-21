
export interface Position {
    x: number;
    y: number;
    z: number;
}
export interface Orientation {
    x: number;
    y: number;
    z: number;
    w: number;
}

export interface Pose {
    position: Position;
    orientation: Orientation;
}

export interface OccupancyGridInfo {
    map_load_time?: {
        secs: number;
        nsecs: number;
    };
    resolution: number;
    width: number;
    height: number;
    origin: Pose;
}

export interface CustomOccupancyGrid {
    data: string;
    info: OccupancyGridInfo;
}
