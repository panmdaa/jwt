import type { HTTP_METHODS } from "../../router/constants";

export type HttpMethod = (typeof HTTP_METHODS)[number];
