import {
  PanelSection,
  PanelSectionRow,
  Navigation,
  Field,
  showModal,
  ModalRoot,
  DialogButton,
  DialogBody,
  DialogHeader,
  DialogBodyText,
  ToggleField,
  SliderField,
} from '@decky/ui';
import { FileSelectionType, openFilePicker } from '@decky/api';
import { useState, useEffect, useRef, VFC, useCallback } from 'react';
import {
  SiPatreon,
  SiGithub,
  SiDiscord,
  SiCrowdin,
  SiMastodon,
  SiKofi,
  SiBluesky,
} from 'react-icons/si';

import BoopIcon from '../Icons/BoopIcon';
import TwitterIcon from '../Icons/TwitterIcon';
import t, { getCredits } from '../../utils/i18n';
import TabSorter from '../TabSorter';
import useSettings, { SettingsProvider } from '../../hooks/useSettings';
import { addHomePatch, removeHomePatch } from '../../patches/homePatch';
import { addSquareLibraryPatch, removeSquareLibraryPatch } from '../../patches/squareLibraryPatch';
import { addCapsuleGlowPatch } from '../../patches/capsuleGlowPatch';
import { rerenderAfterPatchUpdate } from '../../patches/patchUtils';
import { DIMENSIONS } from '../../constants';
import { appgridClasses } from '../../static-classes';

import GuideVideoField from './GuideVideoField';
import PanelSocialButton from './PanelSocialButton';

const tabSettingsDesc = t('MSG_ASSET_TAB_SETTINGS_DESC', 'Reorder or hide unused tabs, and set the default tab that opens when using "{ACTION_CHANGE_ARTWORK}"').replace('{ACTION_CHANGE_ARTWORK}', t('ACTION_CHANGE_ARTWORK', 'Change Artwork...'));
const squareGridSizes = DIMENSIONS.grid_p.options.filter((x) => {
  const [w,h] = x.value.split('x');
  return w === h;
}).map((x) => x.value);

/**
 * Apply patch add/remove operations in a single batch.
 *
 * All intermediate remove/add calls pass suppression flags (unmounting=true,
 * mounting=true) so they skip their individual rerenderAfterPatchUpdate() calls.
 * A single rerenderAfterPatchUpdate() fires at the end, which is itself debounced
 * in patchUtils — so even if this function is called in quick succession, only one
 * navigation cycle occurs.
 *
 * Previously, each call triggered its own Navigate + NavigateBack, causing up to
 * 4 jarring full-page refreshes per toggle flip.
 */
const setPatches = (squares: boolean, uniformFeatured: boolean, coverFit: boolean): void => {
  if (!uniformFeatured && !squares) {
    removeHomePatch(true);
  } else if (squares || uniformFeatured) {
    removeHomePatch(true);
    addHomePatch(true, squares, uniformFeatured, false, coverFit);
    if (squares) {
      removeSquareLibraryPatch(true);
      addSquareLibraryPatch(true, coverFit);
    }
  }
  if (!squares) {
    removeSquareLibraryPatch(true);
  }

  // Single batched rerender after all patches are settled.
  // The debounce in patchUtils coalesces this with any other pending calls.
  rerenderAfterPatchUpdate();
};

const QuickAccessSettings: VFC = () => {
  const { get, set } = useSettings();
  const [useCount, setUseCount] = useState<number | null>(null);
  const [squares, setSquares] = useState<boolean>(false);
  const [coverFit, setCoverFit] = useState<boolean>(false);
  const [uniformFeatured, setUniformFeatured] = useState<boolean>(false);
  const [motdToggle, setMotdToggle] = useState<boolean>(false);
  const [capsuleGlowAmount, setCapsuleGlowAmount] = useState(100);
  const [debugAppid] = useState('70');

  /*
   * Refs that always hold the latest toggle values.
   *
   * Toggle callbacks need to read OTHER toggles' current values when calling
   * setPatches (e.g. handleSquareToggle needs uniformFeatured and coverFit).
   * Previously, these were captured via closure and listed in useCallback deps —
   * meaning every time ANY toggle changed, ALL callbacks were recreated, causing
   * the ToggleField components to receive new onChange props and potentially
   * re-render, lose focus, or flicker.
   *
   * With refs, callbacks read the latest value at call time without needing it
   * in their dependency array. This keeps callback references stable across
   * renders, so ToggleField components don't re-render unnecessarily.
   */
  const squaresRef = useRef(squares);
  const coverFitRef = useRef(coverFit);
  const uniformFeaturedRef = useRef(uniformFeatured);
  squaresRef.current = squares;
  coverFitRef.current = coverFit;
  uniformFeaturedRef.current = uniformFeatured;

  /*
   * Guard against re-initialization.
   *
   * The useEffect below loads settings from the Python backend on mount. It
   * depends on `get` from useSettings(). If the settings provider doesn't
   * memoize `get`, it gets a new reference on each render, re-triggering the
   * effect. That re-fetch reads from the backend — but `set()` writes are
   * async, so the backend might still hold the OLD value, causing the toggle
   * to snap back to its previous state.
   *
   * The ref ensures we only load settings once per QAM panel mount. After
   * that, local React state is the source of truth, and `set()` writes to
   * the backend in the background for persistence.
   */
  const initializedRef = useRef(false);

  const handleMotdToggle = useCallback(async (val: boolean) => {
    set('motd_hidden_global', val, true);
    setMotdToggle(val);
  }, [set]);

  const handleSquareToggle = useCallback(async (checked: boolean) => {
    set('squares', checked, true);
    setSquares(checked);
    // If turning off squares, also turn off coverFit
    if (!checked) {
      set('cover_fit', false, true);
      setCoverFit(false);
    }
    setPatches(checked, uniformFeaturedRef.current, checked ? coverFitRef.current : false);

    const currentFilters = await get('filters_grid_p', {});
    if (checked) {
      // only enable square
      currentFilters['dimensions'] = squareGridSizes;
    } else {
      // set to default
      currentFilters['dimensions'] = DIMENSIONS.grid_p.default;
    }
    set('filters_grid_p', currentFilters, true);
  }, [get, set]);

  const handleUniformFeaturedToggle = useCallback(async (checked: boolean) => {
    set('uniform_featured', checked, true);
    setUniformFeatured(checked);
    setPatches(squaresRef.current, checked, coverFitRef.current);
  }, [set]);

  const handleCoverFitToggle = useCallback(async (checked: boolean) => {
    set('cover_fit', checked, true);
    setCoverFit(checked);
    setPatches(squaresRef.current, uniformFeaturedRef.current, checked);
  }, [set]);

  const handleCapsuleGlowChange = useCallback(async (val: number) => {
    set('capsule_glow_amount', val, true);
    addCapsuleGlowPatch(val);
    setCapsuleGlowAmount(val);
  }, [set]);

  const handleSetUseCount = useCallback(async (val: number) => {
    set('plugin_use_count', val, true);
    setUseCount(val);
  }, [set]);

useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    (async () => {
      try {
        setUseCount(await get('plugin_use_count', 0));
        setSquares(await get('squares', false));
        setCoverFit(await get('cover_fit', false));
        setUniformFeatured(await get('uniform_featured', false));
        setCapsuleGlowAmount(await get('capsule_glow_amount', 100));
        setMotdToggle(await get('motd_hidden_global', false));
      } catch (error) {
        console.error('[SGDB] Failed to load initial settings in QAM:', error);
        // Fallbacks are already handled by your initial useState definitions,
        // so we just catch the error to prevent the async IIFE from hanging.
      }
    })();
  }, [get]);

  if (useCount === null) return null;

  return (
    <>
      {process.env.ROLLUP_ENV === 'development' && (
        <PanelSection title="Debug">
          <PanelSectionRow>
            <Field
              padding="none"
              childrenContainerWidth="max"
            >
              <DialogButton onClick={() => {
                Navigation.Navigate('/zoo');
                Navigation.CloseSideMenus();
              }}
              >
              Zoo
              </DialogButton>
              <DialogButton onClick={() => {
                Navigation.Navigate(`/steamgriddb/${debugAppid}/manage`);
                Navigation.CloseSideMenus();
              }}
              >
                {debugAppid}
              </DialogButton>
              <DialogButton onClick={() => {
                // for debugging reasons do not panic
                set('motd_last_fetched', 0, true);
                setTimeout(() => {
                  set('motd_cached', null, true);
                  setTimeout(() => {
                    set('motd_hidden', null, true);
                  }, 300);
                }, 300);
              }}
              >
              Reset MOTD
              </DialogButton>
              <SliderField
                label="plugin_use_count"
                notchCount={2}
                showValue
                notchTicksVisible={false}
                onChange={handleSetUseCount}
                value={useCount}
                editableValue
                min={0}
                max={1337}
                step={1}
                resetValue={0}
              />
              <DialogButton onClick={() => {
                openFilePicker(
                  FileSelectionType.FOLDER,
                  '/',
                  false,
                  true
                );
              }}
              >
              directory picker
              </DialogButton>
            </Field>
          </PanelSectionRow>
        </PanelSection>
      )}
      {(useCount <= 5) && ( // Hide tutorial if plugin has been used more than 5 times
        <PanelSection title={t('LABEL_USAGE_TITLE', 'Lost? Here\'s a Quick Guide')}>
          <PanelSectionRow>
            <GuideVideoField
              bottomSeparator="standard"
              highlightOnFocus
              focusable
              onActivate={() => {
                showModal(
                  <ModalRoot>
                    <DialogBody style={{ padding: '0 3.5em' }}>
                      <GuideVideoField />
                    </DialogBody>
                  </ModalRoot>
                );
              }}
            />
          </PanelSectionRow>
        </PanelSection>
      )}
      <PanelSection title={t('Settings', 'Settings', true)}>
        <PanelSectionRow>
          <ToggleField
            label={t('LABEL_SQUARE_CAPSULES', 'Square Capsules')}
            description={t('LABEL_SQUARE_CAPSULES_DESC', 'Use square capsules instead of portrait ones. Square filters will be automatically selected.')}
            checked={squares}
            onChange={handleSquareToggle}
          />
        </PanelSectionRow>
        {squares && (
          <PanelSectionRow>
            <ToggleField
              label={t('LABEL_COVER_FIT', 'Cover Fit')}
              description={t('LABEL_COVER_FIT_DESC', 'Crop vertical artwork to fill the square frame without distortion. Keeps the top of the image visible (best for covers with logos at the top).')}
              checked={coverFit}
              onChange={handleCoverFitToggle}
            />
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <ToggleField
            label={t('LABEL_UNIFORM_RECENT', 'Matching Recents Capsule')}
            description={t('LABEL_UNIFORM_RECENT_DESC', 'Make the most recently played game on the home screen match the rest of the capsules.')}
            checked={uniformFeatured}
            onChange={handleUniformFeaturedToggle}
          />
        </PanelSectionRow>
        {appgridClasses?.LibraryImageBackgroundGlow && (
          <PanelSectionRow>
            <SliderField
              label={t('LABEL_CAPSULE_GLOW', 'Capsule Glow')}
              description={t('LABEL_CAPSULE_GLOW_DESC', 'Adjust capsule glow intensity in the library.')}
              notchCount={2}
              notchLabels={[
                {
                  notchIndex: 0,
                  label: t('LABEL_CAPSULE_GLOW_OFF', 'None'),
                },
              ]}
              notchTicksVisible={false}
              onChange={handleCapsuleGlowChange}
              value={capsuleGlowAmount}
              min={0}
              max={100}
              step={1}
              resetValue={100}
            />
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <Field childrenLayout="below" description={tabSettingsDesc}>
            <DialogButton
              onClick={() => {
                showModal((
                  <ModalRoot>
                    <SettingsProvider>
                      <DialogHeader>
                        {t('LABEL_SETTINGS_ASSET_TABS', 'Asset Tab Settings')}
                      </DialogHeader>
                      <DialogBodyText>{tabSettingsDesc}</DialogBodyText>
                      <DialogBody>
                        <TabSorter />
                      </DialogBody>
                    </SettingsProvider>
                  </ModalRoot>
                ));
              }}
            >
              {t('LABEL_SETTINGS_ASSET_TABS', 'Asset Tab Settings')}
            </DialogButton>
          </Field>
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label={t('LABEL_SETTINGS_DISABLE_MOTD', 'Disable Announcements')}
            description={t('LABEL_SETTINGS_DISABLE_MOTD_DESC', 'Announcements are used sparingly to display important information or community events.')}
            checked={motdToggle}
            onChange={handleMotdToggle}
          />
        </PanelSectionRow>
      </PanelSection>
      {/* Uncomment this out should there be a need for experiments again. */}
      {/* <PanelSection title="Experiments">
        <div style={{ fontSize: '12px', padding: '12px 0px' }}>Features with little testing that may be too unstable for regular usage and might be removed later. (Requires restart)</div>

      </PanelSection> */}
      {getCredits() && (
        <PanelSection title={t('LABEL_TRANSLATION_CREDIT_TITLE', 'English Translation')}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '.25em',
          }}
          >
            {getCredits().map((person: any) => <span key={person}>{person}</span>)}
          </div>
        </PanelSection>
      )}
      <PanelSection title={t('LABEL_MORE_SGDB_TITLE', 'More SteamGridDB Stuff')}>
        <PanelSocialButton
          icon={<SiDiscord fill="#5865F2" />}
          url="https://discord.gg/bnSVJrz"
        >
          {t('ACTION_SGDB_DISCORD', 'Join the Discord')}
        </PanelSocialButton>
        <PanelSocialButton
          icon={<SiGithub />}
          url="https://github.com/SteamGridDB/"
        >
          {t('ACTION_SGDB_GITHUB', 'Open Source Projects')}
        </PanelSocialButton>
        <PanelSocialButton
          icon={<SiPatreon fill="#FF424D" />}
          url="https://www.patreon.com/steamgriddb"
        >
          {t('ACTION_SGDB_DONATE', 'Support us on Patreon')}
        </PanelSocialButton>
        <PanelSocialButton
          icon={<SiKofi fill="#FF5E5B" />}
          url="https://ko-fi.com/steamgriddb"
        >
          Ko-fi
        </PanelSocialButton>
        <PanelSocialButton
          icon={<SiCrowdin fill="#fff" />} // actual branding is #2E3340 but it's too dark
          url="https://crowdin.com/project/decky-steamgriddb"
        >
          {t('ACTION_SGDB_TRANSLATE', 'Help Translate')}
        </PanelSocialButton>
        <PanelSocialButton
          icon={<BoopIcon fill="#4e9ac6" />}
          url="https://www.steamgriddb.com/boop"
        >
          {t('ACTION_SGDB_BOOP', 'Check out SGDBoop')}
        </PanelSocialButton>
        <PanelSocialButton
          icon={<SiBluesky fill="#0285FF" />}
          url="https://bsky.app/profile/steamgriddb.com"
        >
          Bluesky
        </PanelSocialButton>
        <PanelSocialButton
          icon={<SiMastodon fill="#6364FF" />}
          url="https://mastodon.gamedev.place/@SteamGridDB"
        >
          Mastodon
        </PanelSocialButton>
        <PanelSocialButton
          icon={<TwitterIcon fill="#1DA1F2" />}
          url="https://twitter.com/SteamGridDB"
        >
          lol
        </PanelSocialButton>
      </PanelSection>
    </>
  );
};

export default QuickAccessSettings;
