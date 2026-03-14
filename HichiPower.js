/*
 * A script to modulate power consumption of a hot water boiler 
 * to store excess solar energy.
 * Uses a hichi meter attached to an ED300L utility meter
 * and a Shelly dimmer 0/1-10V PM Gen3 controlling 
 * a high power dimmer connected to a dumb water boiler.
 */

let HICHI_URL = "http://hichi/cm?cmnd=Status%208";
let BUFFER_MAX_POWER= 2000

let STANDBY_POWER= 5 // the power, below which the boiler is considered full
let STANDBY_BRIGHTNESS= // the 0-100 dimming value set when the boiler is full
  Math.floor( 50*100/BUFFER_MAX_POWER ) // 50W in %
let BUFFER_MAX_BRIGHTNESS= // fail safe upper limit for the boiler power consumptino
  Math.floor( 700*100/BUFFER_MAX_POWER ) // 700W in %

// some global vars
let localStatus= null
let brightness= null // 0 to 100
let power= null // buffer consumption
let on= null // switch status

function setBrightness(value) { // expects an int, fails with floats
  
  // Send the command to the local dimmer (id: 0)
  Shelly.call(
    "Light.Set", 
    { id: 0, brightness: value }, 
    function(set_res, set_err_code, set_err_msg) {
      if (set_err_code !== 0) {
        print("Error setting dimmer: ", set_err_msg)
      }
    }
  )
  print("Set brightness to ", value, " from ", brightness)
}

function setSwitch(value) {  // actuates the built-in relay
  // Send the command to the local switch (id: 0)
  Shelly.call(
    "Light.set", 
    {'id': 0, 'on': value},
    function(set_res, set_err_code, set_err_msg) {
      if (set_err_code !== 0) {
        print("Error setting switch: ", set_err_msg)
      }
    }
  )
  print("Turned switch ", value ? "on" : "off", " was ", on ? "on" : "off")
}

function handleResponse(res, err_code, err_msg) {  // callback from the hichi poll

  if (err_code === 0 && res && res.body) {
    let payload = JSON.parse(res.body);
    if (payload && payload.StatusSNS && payload.StatusSNS.ED300L) {

      let gridPower = payload.StatusSNS.ED300L.Power // instant grid power consumption
      print("gridPower: ", gridPower, "W   Brightness: ", brightness, "    Power: ", power, "W    On: ", on)
      
      // grid power < 0 --> increase buffer consumption, else decrease
      let delta= -power * 100 / BUFFER_MAX_POWER
      
      // add delta to the current brightness and clip it
      let newBrightness= Math.floor(brightness + delta)
      if (newBrightness > BUFFER_MAX_BRIGHTNESS) {
        print("Unexpected brightness value: ", newBrightness )
        newBrightness= BUFFER_MAX_BRIGHTNESS
      }
      
      if (newBrightness < 0 && on) { // turn the switch off if there's no excess power
        setSwitch(false)
      }
      else if (newBrightness > 0) { // update the boiler's power consumption
        if (!on) {
          setSwitch(true) // turn on if needed
        }
        if (brightness != STANDBY_BRIGHTNESS) { // if needed
          setBrightness(newBrightness)
        }
      }
    } else {
      print("Unexpected JSON structure.")
    }
  } else {
    print("HTTP request failed or timed out.")
  }
}

function pollHichiMeter() {
  
  localStatus= Shelly.getComponentStatus("light:0") // fetch the internal Shelly state
  brightness= localStatus.brightness // 0 to 100
  power= localStatus.apower // instant power consumption
  on= localStatus.output // switch status
  
  if (on && (power < STANDBY_POWER) ) {  // the boiler is fully charged, no need to poll the meter
    if (brightness != STANDBY_BRIGHTNESS) { // also dial down the power for a soft restart
      print(brightness,STANDBY_BRIGHTNESS )
      setBrightness(STANDBY_BRIGHTNESS)
      print("Buffer full, set brightness to minimum.")
    } 
  }
  else { // fetch meter power flow to either turn on the boiler or modulate the power
    Shelly.call("HTTP.GET", { url: HICHI_URL, timeout: 3 }, handleResponse);    
  }
  
  Timer.set(2000, false, pollHichiMeter, null)
}

// Initiate the loop
pollHichiMeter()
print("+++++ Started script +++++")
