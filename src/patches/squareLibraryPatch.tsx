import {
  afterPatch,
  findInTree,
  findInReactTree,
  wrapReactType,
  findSP,
} from '@decky/ui';
import { RoutePatch, routerHook } from '@decky/api';

import { gamepadLibraryClasses, libraryAssetImageClasses } from '../static-classes';
import { addStyle, removeStyle } from '../utils/styleInjector';

import { rerenderAfterPatchUpdate } from './patchUtils';

let patch: RoutePatch | undefined;

// Stores patched components keyed by cache key to prevent infinite loops
const tabContentCache = new Map<string, any>();

const patchGridProps = (props: any) => {
  const gridProps = findInTree(props, (x) => x?.childWidth, { walkable: ['props', 'children', 'childSections'] });
  if (gridProps) {
    gridProps.childHeight = gridProps.childWidth;
  }
};

/**
 * Safely patches a component's afterPatch output using a cache.
 *
 * IMPORTANT: Since @decky/ui's wrapReactType creates a spread-copy object
 * (not a function wrapper), we must NEVER call wrapReactType + afterPatch(element, 'type')
 * in sequence. Instead, this helper assumes element.type is already a callable function
 * (which is the case for nodes found via findInReactTree for grids, collections, etc.)
 * and patches element.type directly via afterPatch.
 *
 * The cache prevents re-wrapping on every render which would cause infinite loops.
 */
const patchWithCache = (element: any, cacheKey: string, patcher: (args: any[], ret: any) => any) => {
  if (!element || !element.type) return;

  if (tabContentCache.has(cacheKey)) {
    element.type = tabContentCache.get(cacheKey);
    return;
  }

  try {
    afterPatch(element, 'type', patcher);
    tabContentCache.set(cacheKey, element.type);
  } catch (e) {
    console.error('[Square Art] Failed to patch component:', e);
    // Cache the unpatched type to prevent retry spam on every render
    tabContentCache.set(cacheKey, element.type);
  }
};

export const addSquareLibraryPatch = (mounting = false, coverFit = false) => {
  removeSquareLibraryPatch(true);

  // inject container CSS (outside patch callback — only needs to run once)
  addStyle('sgdb-square-capsules-library', `
    /* only select covers within library page, otherwise it breaks covers on other pages */
    .${gamepadLibraryClasses.GamepadLibrary} .${libraryAssetImageClasses.Container}.${libraryAssetImageClasses.PortraitImage} {
      aspect-ratio: 1 / 1 !important;
      padding-top: unset !important;
      height: auto !important;
    }
  `);

  // inject cover fit CSS when enabled
  if (coverFit) {
    addStyle('sgdb-cover-fit-library', `
      .${gamepadLibraryClasses.GamepadLibrary} .${libraryAssetImageClasses.Container}.${libraryAssetImageClasses.PortraitImage} img {
        object-fit: cover !important;
        object-position: top center !important;
      }
    `);
  } else {
    removeStyle('sgdb-cover-fit-library');
  }

  patch = routerHook.addPatch('/library', (props) => {
    afterPatch(props.children, 'type', (_: Record<string, unknown>[], ret?: any) => {
      let cache: any = null;
      afterPatch(ret, 'type', (_: Record<string, unknown>[], ret2?: any) => {
        if (cache) {
          ret2.type = cache;
          return ret2;
        }
        // wrapReactType creates a spread-copy object, afterPatch then patches .type on THAT object
        wrapReactType(ret2);
        afterPatch(ret2.type, 'type', (_: Record<string, unknown>[], ret3?: any) => {
          cache = ret2.type;

          const tabInfo = findInReactTree(ret3, (x) => x?.tabs && x?.activeTab);
          if (!tabInfo) return ret3;

          const { tabs, activeTab } = tabInfo;
          const tab = tabs?.find((x: any) => x.id == activeTab);

          if (!tab || tab.content.props?.collectionid === null) {
            return ret3;
          }

          if (tab.content.props.children || tab.content.props.collection || tab.content.type) {
            const collection = tab.content.props?.children || tab.content;
            const uniqueTabKey = activeTab || 'unknown-tab';

            // Use patchWithCache for the collection component to prevent infinite re-renders
            patchWithCache(collection, uniqueTabKey, (_: Record<string, unknown>[], ret4) => {
              if (!ret4) return ret4;

              const p1 = findInReactTree(ret4, (x) => x?.type && x.props?.appOverviews);
              const coverSizeComponent = findInReactTree(ret4.props.children, (x) => x?.type && x.type.toString().includes('coverSize'));

              if (p1 && collection) {
                // Main Library (Installed, All Games)
                patchWithCache(p1, `${uniqueTabKey}_grid`, (_: Record<string, unknown>[], ret5) => {
                  patchGridProps(ret5);
                  return ret5;
                });
              } else if (coverSizeComponent) {
                // Ignore collections overview page
                return ret4;
              } else {
                if (ret4.props.children[0]?.props?.collectionid) {
                  // User Collections
                  const collectionContainer = ret4.props.children[0];

                  patchWithCache(collectionContainer, `${uniqueTabKey}_container`, (_: Record<string, unknown>[], ret5) => {
                    const innerC = findInReactTree(ret5, (x) => x?.type && x.props?.collection?.id);
                    if (innerC) {
                      const innerId = innerC.props?.collection?.id || 'inner';
                      patchWithCache(innerC, `${uniqueTabKey}_${innerId}`, (_: Record<string, unknown>[], ret6) => {
                        const grid = findInReactTree(ret6, (x) => x?.type && x.props?.appOverviews);
                        if (grid) {
                          patchWithCache(grid, `${uniqueTabKey}_${innerId}_grid`, (_: Record<string, unknown>[], ret7) => {
                            patchGridProps(ret7);
                            return ret7;
                          });
                        }
                        return ret6;
                      });
                    }
                    return ret5;
                  });
                } else {
                  // Non-Steam Shortcuts
                  const p2 = findInReactTree(ret4, (x) => x?.type && x.props?.collection?.id === 'deck-desktop-apps');

                  if (p2) {
                    patchWithCache(p2, 'deck-desktop-apps-container', (_: Record<string, unknown>[], ret5) => {
                      const grid = findInReactTree(ret5, (x) => x?.type && x.props?.appOverviews);
                      if (grid) {
                        patchWithCache(grid, 'deck-desktop-apps-grid', (_: Record<string, unknown>[], ret6) => {
                          patchGridProps(ret6);
                          return ret6;
                        });
                      }
                      return ret5;
                    });
                  }
                }
              }
              return ret4;
            });
          }
          return ret3;
        });
        return ret2;
      });
      return ret;
    });
    return props;
  });

  if (!mounting) rerenderAfterPatchUpdate();
};

export function removeSquareLibraryPatch(unmounting = false): void {
  tabContentCache.clear();
  if (patch) {
    const sp = findSP();
    sp?.window?.document?.getElementById('sgdb-square-capsules-library')?.remove();
    sp?.window?.document?.getElementById('sgdb-cover-fit-library')?.remove();
    routerHook.removePatch('/library', patch);
    patch = undefined;

    if (!unmounting) rerenderAfterPatchUpdate();
  }
}
