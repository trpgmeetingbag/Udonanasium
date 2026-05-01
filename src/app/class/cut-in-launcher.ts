import { SyncObject, SyncVar } from './core/synchronize-object/decorator';
import { GameObject, ObjectContext } from './core/synchronize-object/game-object';
import { EventSystem, Network } from './core/system';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { Jukebox } from '@udonarium/Jukebox';
import { CutIn } from './cut-in';
import { AudioStorage } from './core/file-storage/audio-storage';

import { CutInWindowComponent } from 'component/cut-in-window/cut-in-window.component';

@SyncObject('cut-in-launcher')
export class CutInLauncher extends GameObject {
  @SyncVar() launchCutInIdentifier: string = '';
  @SyncVar() launchTimeStamp: number = 0;
  @SyncVar() launchMySelf = false;
  @SyncVar() launchIsStart: boolean = false;
  @SyncVar() stopBlankTagCutInTimeStamp: number = 0;
  @SyncVar() sendTo: string = '';

  get jukebox(): Jukebox { return ObjectStore.instance.get<Jukebox>('Jukebox'); }

  isCutInBgmUploaded(audioIdentifier: string) {
    let audio = AudioStorage.instance.get(audioIdentifier);
    return audio ? true : false;
  }

  chatActivateCutIn(text: string, sendTo: string) {
    const text2 = ' ' + text;
    const matches_array = text2.match(/\s(\S+)$/i);
    let activateName = '';

    if (matches_array) {
      activateName = RegExp.$1;
      const allCutIn = this.getCutIns();

      for (const cutIn_ of allCutIn) {
        if (cutIn_.chatActivate && (cutIn_.name == activateName)) {
          if (this.isCutInBgmUploaded(cutIn_.audioIdentifier) && (cutIn_.tagName == '')) {
            this.jukebox.stop();
          }
          this.startCutIn(cutIn_, sendTo);
          return;
        }
      }
    }
  }

  startCutInMySelf(cutIn: CutIn) {
    this.launchCutInIdentifier = cutIn.identifier;
    this.launchIsStart = true;
    this.launchTimeStamp++;
    this.launchMySelf = true;
    this.sendTo = '';
    this.startSelfCutIn();
  }

  startCutIn(cutIn: CutIn, sendTo?: string) {
    this.launchCutInIdentifier = cutIn.identifier;
    this.launchIsStart = true;
    this.launchTimeStamp++;
    this.launchMySelf = false;
    this.sendTo = sendTo ? sendTo : '';
    this.startSelfCutIn();
  }

  stopCutIn(cutIn: CutIn) {
    this.launchCutInIdentifier = cutIn.identifier;
    this.launchIsStart = false;
    this.launchTimeStamp++;
    this.launchMySelf = false;
    this.stopSelfCutIn();
  }

  stopBlankTagCutIn() {
    this.stopBlankTagCutInTimeStamp++;
    EventSystem.trigger('STOP_CUT_IN_BY_BGM', {});
  }

  startSelfCutIn() {
    const cutIn_ = ObjectStore.instance.get(this.launchCutInIdentifier);
    EventSystem.trigger('START_CUT_IN', { cutIn: cutIn_ });
  }

  stopSelfCutIn() {
    const cutIn_ = ObjectStore.instance.get(this.launchCutInIdentifier);
    EventSystem.trigger('STOP_CUT_IN', { cutIn: cutIn_ });
  }

  getCutIns(): CutIn[] {
    return ObjectStore.instance.getObjects(CutIn);
  }

  apply(context: ObjectContext) {
    const launchCutInIdentifier = this.launchCutInIdentifier;
    const launchIsStart = this.launchIsStart;
    const launchTimeStamp = this.launchTimeStamp;
    const stopBlankTagCutInTimeStamp = this.stopBlankTagCutInTimeStamp;

    super.apply(context);

    if (this.launchMySelf) return;

    if (stopBlankTagCutInTimeStamp !== this.stopBlankTagCutInTimeStamp) {
      EventSystem.trigger('STOP_CUT_IN_BY_BGM', {});
    }

    if (this.sendTo != '') {
      if (this.sendTo != Network.peer.userId) return;
    }

    if (launchCutInIdentifier !== this.launchCutInIdentifier ||
        launchIsStart !== this.launchIsStart ||
        launchTimeStamp !== this.launchTimeStamp) {
      if (this.launchIsStart) {
        this.startSelfCutIn();
      } else {
        this.stopSelfCutIn();
      }
    }
  }
}