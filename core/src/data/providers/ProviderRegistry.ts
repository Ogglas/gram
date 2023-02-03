import { Provider } from "./Provider";

export type ProviderRegistry<T extends Provider> = Map<string, T>;