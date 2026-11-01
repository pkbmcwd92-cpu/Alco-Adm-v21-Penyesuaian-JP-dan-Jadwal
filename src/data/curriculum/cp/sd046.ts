import source from './sources/cp-sd-bskap-046-2025-source-matched.json';
import { adaptCP046Review } from './review046Adapter';

/** Explicit Step 03 source choice; never merged with the historical pool or saved teacher data. */
export const SD_REVIEW_CP_ENTRIES = adaptCP046Review(source, 'SD');
