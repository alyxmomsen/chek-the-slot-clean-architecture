export interface LocationTopicConfig {
    locationId: number;
    chatId: string;
    topicName: string; // "summary", "changes", "booking", "system"
    threadId: number | null;
}

export interface ILocationTopicMapRepository {
    load(): Promise<LocationTopicConfig[]>;
    save(configs: LocationTopicConfig[]): Promise<void>;
    updateThreadId(
        locationId: number,
        topicName: string,
        threadId: number
    ): Promise<void>;
    getTopic(
        locationId: number,
        topicName: string
    ): LocationTopicConfig | undefined;
}
