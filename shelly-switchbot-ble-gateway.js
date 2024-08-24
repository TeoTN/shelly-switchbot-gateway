/**
 * SwitchBot (Outdoor) Thermo-/Hygrometer Sensor BLE Gateway
 *
 * Automatically detects devices and registers them with Home Assistant
 * through MQTT auto-discovery mechanism.
 *
 * Tested on SwitchBot Indoor/Outdoor Thermo-/Hygrometer sensor
 * and Shelly Blu Gateway
 *
 * You're using the script on your own responsibility.
 *
 * Author: Piotr Staniów
 */

let CONFIG = {
  scan_duration: BLE.Scanner.INFINITE_SCAN,
  mqtt_topic: "blegateway/",
  mqtt_src: null,
  discovery_topic: "homeassistant/",
};

//BTHomev2: ID , Size, Sign, Factor, Name
let datatypes = [
  [0x00, 1, false, 1, "pid"],
  [0x01, 1, false, 1, "battery"],
  [0x12, 2, false, 1, "co2"],
  [0x0c, 2, false, 0.001, "voltage"],
  [0x4a, 2, false, 0.1, "voltage"],
  [0x08, 2, true, 0.01, "dewpoint"],
  [0x03, 2, false, 0.01, "humidity"],
  [0x2e, 1, false, 1, "humidity"],
  [0x05, 3, false, 0.01, "illuminance"],
  [0x14, 2, false, 0.01, "moisture"],
  [0x2f, 1, false, 1, "moisture"],
  [0x04, 3, false, 0.01, "pressure"],
  [0x45, 2, true, 0.1, "temperature"],
  [0x02, 2, true, 0.01, "temperature"],
  [0x3f, 2, true, 0.1, "rotation"],
  [0x3a, 1, false, 1, "button"], //selector
  [0x15, 1, false, 1, "battery_ok"], //binary
  [0x16, 1, false, 1, "battery_charging"], //binary
  [0x17, 1, false, 1, "co"], //binary
  [0x18, 1, false, 1, "cold"], //binary
  [0x1a, 1, false, 1, "door"], //binary
  [0x1b, 1, false, 1, "garage_door"], //binary
  [0x1c, 1, false, 1, "gas"], //binary
  [0x1d, 1, false, 1, "heat"], //binary
  [0x1e, 1, false, 1, "light"], //binary
  [0x1f, 1, false, 1, "lock"], //binary
  [0x20, 1, false, 1, "moisture_warn"], //binary
  [0x21, 1, false, 1, "motion"], //binary
  [0x2d, 1, false, 1, "window"], //binary
];

let discovered = [];

function convertByteArrayToSignedInt(bytes, byteSize) {
  let result = 0;
  const signBit = 1 << (byteSize * 8 - 1);
  for (let i = 0; i < byteSize; i++) {
    result |= bytes.at(i) << (i * 8);
  }
  // Check sign bit and sign-extend if needed
  if ((result & signBit) !== 0) {
    result = result - (1 << (byteSize * 8));
  }
  return result;
}

function convertByteArrayToUnsignedInt(bytes, byteSize) {
  let result = 0;
  for (let i = 0; i < byteSize; i++) {
    result |= bytes.at(i) << (i * 8);
  }
  return result >>> 0; // Ensure the result is an unsigned integer
}

function extractBTHomeData(payload) {
  let index = 0;
  let extractedData = {};
  while (index < payload.length) {
    dataId = payload.at(index);
    index = index + 1;
    let dataType = -1;
    for (let i = 0; i < datatypes.length; i++) {
      if (datatypes[i][0] == dataId) {
        dataType = i;
        break;
      }
    }
    if (dataType > -1) {
      let byteSize = datatypes[i][1];
      let factor = datatypes[i][3];
      let rawdata = payload.slice(index, index + byteSize);
      if (datatypes[i][2]) {
        value = convertByteArrayToSignedInt(rawdata, byteSize);
      } else {
        value = convertByteArrayToUnsignedInt(rawdata, byteSize);
      }
      extractedData[datatypes[i][4]] = value * factor;
      index += byteSize;
    } else {
      index = 10;
    }
  }

  return extractedData;
}

function gettopicname(resarray) {
  let resstr = "";
  let rlen = Object.keys(resarray).length;
  if (rlen > 0) {
    if (rlen == 1) {
      resstr = Object.keys(resarray)[0];
    } else if (
      "temperature" in resarray ||
      "humidity" in resarray ||
      "pressure" in resarray
    ) {
      resstr = "sensor";
    } else if ("battery" in resarray) {
      resstr = "telemetry";
    } else {
      resstr = "status";
    }
  }
  return resstr;
}

function autodiscovery(address, topname, topic, jsonstr) {
  let adstr = [];
  let params = Object.keys(jsonstr);
  let subt = "";
  for (let i = 0; i < params.length; i++) {
    let pload = {};
    subt = "";
    pload["device"] = {};
    pload["device"]["name"] = address + " " + topname;
    pload["device"]["identifiers"] = [];
    pload["device"]["identifiers"].push(address);
    pload["name"] = pload["device"]["name"];
    pload["stat_t"] = topic;
    pload["uniq_id"] = address + "-" + params[i];
    pload["stat_cla"] = "measurement";
    if (params[i] == "temperature") {
      pload["dev_cla"] = params[i];
      pload["unit_of_meas"] = "C";
      subt = params[i];
    } else if (params[i] == "humidity") {
      pload["dev_cla"] = params[i];
      pload["unit_of_meas"] = "%";
      subt = params[i];
    } else if (params[i] == "battery") {
      pload["dev_cla"] = params[i];
      pload["unit_of_meas"] = "%";
      subt = params[i];
    } else if (params[i] == "illuminance") {
      pload["dev_cla"] = params[i];
      pload["unit_of_meas"] = "lx";
      subt = params[i];
    } else if (params[i] == "pressure") {
      pload["dev_cla"] = "atmospheric_pressure";
      pload["unit_of_meas"] = "hPa";
      subt = pload["dev_cla"];
    } else if (params[i] == "rssi") {
      pload["dev_cla"] = "signal_strength";
      pload["entity_category"] = "diagnostic";
      pload["unit_of_meas"] = "dBm";
      subt = "RSSI";
    }
    if (subt != "") {
      pload["value_template"] = "{{ value_json." + params[i] + " }}";
      adstr.push([
        CONFIG.discovery_topic + "sensor/" + address + "/" + subt + "/config",
        JSON.stringify(pload),
      ]);
    }
  }
  return adstr;
}

function mqttreport(address, rssi, jsonstr) {
  let addrstr = String(address).split(":").join("");
  let topname = gettopicname(jsonstr);
  let topic = CONFIG.mqtt_topic + addrstr + "/" + topname;
  jsonstr["rssi"] = rssi;
  if (CONFIG.mqtt_src) {
    jsonstr["src"] = CONFIG.mqtt_src;
  }
  if (discovered.indexOf(addrstr + topname) == -1) {
    let adstr = autodiscovery(addrstr, topname, topic, jsonstr);
    if (adstr.length > 0) {
      for (let i = 0; i < adstr.length; i++) {
        if (adstr[i].length > 1) {
          MQTT.publish(adstr[i][0], adstr[i][1], 1, true); //        console.log("AD",i,adstr[i][0],adstr[i][1]);
        }
      }
    }
    discovered.push(addrstr + topname); //mark as discovered
  } // end AD
  MQTT.publish(topic, JSON.stringify(jsonstr), 0, false);
  //console.log('Published:', topic,JSON.stringify(jsonstr),1,true);
}

function scanCB(ev, res) {
  if (ev !== BLE.Scanner.SCAN_RESULT) return;
  const data = res && res.advData;

  if (data.at(5) !== 0x69 || data.at(6) !== 0x09) {
    // Not SwitchBot Outdoor Meter
    return;
  }

  const addr = res && res.addr && res.addr.toUpperCase();
  // if (addr !== "C7:34:30:35:28:19" && addr !== "C1:34:30:35:36:43") return;

  const mac = data.slice(7, 13);
  const sensorData = data.slice(15, 18);
  const humidity = sensorData.at(2) & 0x7f;
  const temp =
    ((sensorData.at(1) & 0x80) > 0 ? 1 : -1) *
    ((sensorData.at(1) & 0x7f) + sensorData.at(0) * 0.1);
  let segments = [];
  for (let i = 0; i < data.length; i++) {
    segments.push(data.at(i).toString(16));
  }
  /*
  print("Segments:", segments.join(", "));
  print("temp", temp);
  print("humidity", humidity);
  */

  let prot = "switchbot";
  let hdr = {
    id: addr,
    mac: addr,
    temperature: temp,
    humidity: humidity,
  };

  //console.log(res.addr,res.rssi,res.advData.length,res.advData.at(0), res.advData.at(1) ,res.advData.at(2), res.advData.at(3),res.advData.at(6), res.advData.at(7),res.advData.at(15), res.advData.at(16));
  mqttreport(res.addr, res.rssi, hdr);
  // console.log(prot, res.addr, res.rssi, hdr);
}

// retry several times to start the scanner if script was started before
// BLE infrastructure was up in the Shelly
function startBLEScan() {
  discovered = [];
  let bleScanSuccess = BLE.Scanner.Start(
    { duration_ms: CONFIG.scan_duration, active: false },
    scanCB
  );
  if (bleScanSuccess === false) {
    Timer.set(1000, false, startBLEScan);
  } else {
    console.log("Success: BLE passive scanner running");
  }
}

//Check for BLE config and print a message if BLE is not enabled on the device
let BLEConfig = Shelly.getComponentConfig("ble");
if (BLEConfig.enable === false) {
  console.log("Error: BLE not enabled");
} else {
  Timer.set(1000, false, startBLEScan);
}
