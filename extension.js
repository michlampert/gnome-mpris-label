const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const {Clutter,Gio,GLib,St} = imports.gi;
const Mainloop = imports.mainloop;
const Lang = imports.lang;

//"User-defined" constants
const LEFT_PADDING = 30;
const RIGHT_PADDING = 30;
const MAX_STRING_LENGTH = 40;
const EXTENSION_INDEX = 2;
const EXTENSION_PLACE = "left";
const REFRESH_RATE = 300;

const playerInterface = `
<node>
	<interface name="org.mpris.MediaPlayer2.Player">
		<property name="Metadata" type="a{sv}" access="read"/>
	</interface>
</node>`

const dBusInterface = `
<node>
	<interface name="org.freedesktop.DBus">
		<method name="ListNames">
			<arg direction="out" type="as"/>
		</method>
	</interface>
</node>`

class MprisLabel {
	constructor(){
		this._indicator = null;
	}

	enable() {
		this._indicator = new PanelMenu.Button(0.0,'Mpris Label',false);
		this.buttonText = new St.Label({
			text: "",
			style: "padding-left: " + LEFT_PADDING + "px;"
			+ "padding-right: " + RIGHT_PADDING + "px; ",
			y_align: Clutter.ActorAlign.CENTER,
			x_align: Clutter.ActorAlign.FILL
		});
		this._indicator.add_child(this.buttonText);
		Main.panel.addToStatusArea('Mpris Label',this._indicator,EXTENSION_INDEX,EXTENSION_PLACE);

		this.player = null;
		this._refresh();
	}

	_refresh() {
		this._loadData();
		this._removeTimeout();
		this._timeout = Mainloop.timeout_add(REFRESH_RATE, Lang.bind(this, this._refresh));
		return true;
	}

	_loadData() {
		try{
			let playerList = getPlayerList();

			if (!playerList[0]){
				this.buttonText.set_text("");
				return
			}
			
			if(!this.player)
				this.player = new Player(playerList[0])

			if(!playerList.includes(this.player.address))
				this.player.address = playerList[0];

			this.buttonText.set_text(this._buildLabel());
		}
		catch{
			this.buttonText.set_text("");
		}
	}

	_buildLabel(){
		let title = this.player.getMetadata("xesam:title");
		let album = this.player.getMetadata("xesam:album");
		let artist = this.player.getMetadata("xesam:artist");
	
		let labelstring = artist + album + title;
		labelstring = labelstring.substring(0,labelstring.length-3);
	
		return labelstring
	}

	_removeTimeout() {
		if (this._timeout) {
			Mainloop.source_remove(this._timeout);
			this._timeout = null;
		}
	}

	disable(){
		this._indicator.destroy();
		this._indicator = null;
		this.player = null
		this._removeTimeout();
	}
}

function init(){
	return new MprisLabel();
}

class Player {
	constructor(dbusAddress){
		this.wrapper = Gio.DBusProxy.makeProxyWrapper(playerInterface);
		this.proxy = this.wrapper(Gio.DBus.session,dbusAddress, "/org/mpris/MediaPlayer2");
		this.address = dbusAddress;
	}
	getMetadata(field){
		if(field == "xesam:artist")
			return parseMetadataField(this.proxy.Metadata[field].get_strv()[0]);

		return parseMetadataField(this.proxy.Metadata[field].get_string()[0]);
	}
	changeAddress(busAddress){
		this.address = busAddress;
	}
}

function getPlayerList () {
	let dBusProxyWrapper = Gio.DBusProxy.makeProxyWrapper(dBusInterface);
	let dBusProxy = dBusProxyWrapper(Gio.DBus.session,"org.freedesktop.DBus","/org/freedesktop/DBus");
	let dBusList = dBusProxy.ListNamesSync()[0];

	let playerList = [];
	dBusList.forEach(element => {
		if (element.startsWith("org.mpris.MediaPlayer2")){
			playerList.push(element);
		}
	});
	return playerList;
}

function parseMetadataField(data) {

	if (data.length == 0)
		return ""

	if (data.includes("xesam:") || data.includes("mpris:"))
		return ""
	
	//Replaces every instance of " | "
	if(data.includes(" | "))
		data = data.replace(/ \| /g, " / ");

	//Shorten string if it's longer than 
	if (data.length > MAX_STRING_LENGTH){
		data = data.substring(0, MAX_STRING_LENGTH);
		data = data.substring(0, data.lastIndexOf(" ")) + "...";
	}

	if(data.match(/Remaster/i))
		data = removeRemasterText(data);

	data += " | ";

	return data
}

function removeRemasterText(datastring) {
	let matchedSubString = datastring.match(/\((.*?)\)/gi); //matches text between parentheses

	if (!matchedSubString)
		matchedSubString = datastring.match(/-(.*?)$/gi); //matches text between a hyphen(-) and the end of the string

	if (!matchedSubString)
		return datastring //returns <datastring> unaltered if both matches were not successful

	if(!matchedSubString[0].match(/Remaster/i))
		return datastring //returns <datastring> unaltered if our match doesn't contain 'remaster'

	datastring = datastring.replace(matchedSubString[0],"");

	if (datastring.charAt(datastring.length-1) == " ")
		datastring = datastring.substring(0,datastring.length-1); 

	return datastring
}