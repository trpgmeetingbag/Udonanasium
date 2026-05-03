import { SyncObject, SyncVar } from './core/synchronize-object/decorator';
import { ObjectNode } from './core/synchronize-object/object-node';
import { InnerXml } from './core/synchronize-object/object-serializer';
import { ObjectContext } from './core/synchronize-object/game-object';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { Jukebox } from '@udonarium/Jukebox';
import { EventSystem, Network } from '@udonarium/core/system';
import { DiceBot } from '@udonarium/dice-bot';

@SyncObject('config')
export class Config extends ObjectNode implements InnerXml {

  @SyncVar() _defaultDiceBot: string = 'DiceBot';
  @SyncVar() _roomVolume: number = 1.00;
  @SyncVar() _roomGridDispAlways: boolean = false;

  // get defaultDiceBot(): string { return this._defaultDiceBot === '' ? 'DiceBot' : this._defaultDiceBot; }
  // set defaultDiceBot(dice: string) { this._defaultDiceBot = dice; }

get defaultDiceBot(): string {
    if(this._defaultDiceBot == ''){
      return 'DiceBot';
    }
    return this._defaultDiceBot;
  }
  
  set defaultDiceBot(dice: string) { 
    if (this._defaultDiceBot !== dice) {
      this._defaultDiceBot = dice; 
      EventSystem.call('CHANGE_DEFAULT_DICEBOT', this._defaultDiceBot);
    }
  }

  get roomVolume(): number { return this._roomVolume; }
  set roomVolume(volume: number) { this._roomVolume = volume; }

  get jukebox(): Jukebox { return ObjectStore.instance.get<Jukebox>('Jukebox'); }

  get roomGridDispAlways(): boolean { return this._roomGridDispAlways; }
  set roomGridDispAlways(roomGridDispAlways: boolean) { this._roomGridDispAlways = roomGridDispAlways; }

  // private static _instance: Config;  
  // static get instance(): Config {
  //   if (!Config._instance) {
  //     Config._instance = new Config('Config');
  //     Config._instance.initialize();
  //   }
  //   return Config._instance;
  // }
  static get instance(): Config {
    // データベースから最新のConfigを探す
    let config = ObjectStore.instance.get<Config>('Config');
    
    // もしまだ存在しなければ（最初の1回だけ）、新しく作って登録する
    if (!config) {
      config = new Config('Config');
      config.initialize();
    }
    return config;
  }

parseInnerXml(element: Element) {
    console.log(`[Debug Config] --- ZIPからXMLデータを読み込みました！ ---`);
    console.log(`[Debug Config] XMLの中身:`, element.outerHTML);

    let context = Config.instance.toContext();
    context.syncData = this.toContext().syncData;
    Config.instance.apply(context);
    Config.instance.update();

    super.parseInnerXml.apply(Config.instance, [element]);
    this.destroy();
    console.log(`[Debug Config] XMLの中身:`, element.outerHTML);
  }

  apply(context: ObjectContext) {
    let _roomVolume = this._roomVolume;
    let _defaultDiceBot = this._defaultDiceBot;
    super.apply(context);
    
    if (_defaultDiceBot !== this._defaultDiceBot) {
      console.log(`[Debug Config] データ変更検知: ダイスボットが ${_defaultDiceBot} から ${this._defaultDiceBot} に変わりました`);
    }

    if (_roomVolume !== this._roomVolume) {
      if (this.jukebox) this.jukebox.setNewVolume();
    }
  }
}