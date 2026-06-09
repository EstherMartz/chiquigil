import { createContext } from 'react';

/**
 * True inside a scan/result table, where an item row should offer a "hide"
 * control. Defaults to false so ItemNameLinks renders no chip on item pages,
 * hovers, etc.
 */
export const IgnoreAffordanceContext = createContext<boolean>(false);
