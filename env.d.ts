declare module '@tailwindcss/vite' {
    import { Plugin } from 'vite';
    export default function tailwindcss(): Plugin;
}

declare module 'vite-plugin-pwa' {
    import { Plugin } from 'vite';
    export function VitePWA(options?: any): Plugin;
}

declare module 'virtual:pwa-register' {
    export type RegisterSWOptions = {
        immediate?: boolean;
        onNeedRefresh?: () => void;
        onOfflineReady?: () => void;
        onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
        onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
        onRegisterError?: (error: any) => void;
    };

    export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}
