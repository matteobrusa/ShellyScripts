/*
 * A script to modulate power consumption of a hot water boiler 
 * to store excess solar energy.
 * Uses a hichi meter attached to an ED300L utility meter
 * and a Shelly dimmer 0/1-10V PM Gen3 controlling 
 * a high power dimmer connected to a dumb water boiler.
 */

let HICHI_URL = "http://192.168.1.32/cm?cmnd=Status%208";
let BUFFER_MAX_POWER= 2000
let POWER_TARGET= -10 // aim to always give a bit

let STANDBY_POWER= 5 // the power, below which the boiler is considered full
let STANDBY_BRIGHTNESS= // the 0-100 dimming value set when the boiler is full
  Math.ceil( 50*100/BUFFER_MAX_POWER ) // 50W in %
let BUFFER_MAX_BRIGHTNESS= // fail safe upper limit for the boiler power consumptino
  Math.floor( 700*100/BUFFER_MAX_POWER ) // 700W in %

// some global vars
let snooze= 0
let localStatus= null
let brightness= null // 0 to 100
let power= null // buffer consumption
let on= null // switch status
let lastGridPower= -1

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
  let ex= (value -brightness) /100 *2000
  print("Set brightness to ", value, " from ", brightness, "expected change", ex, "W")
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
    let payload = JSON.parse(res.body)
    if (payload && payload.StatusSNS && payload.StatusSNS.ED300L) {

      let gridPower = payload.StatusSNS.ED300L.Power // instant grid power consumption
      
      // wait for the hichi to update the power 
      // and avoid oscillations
      if (gridPower != lastGridPower) {
        lastGridPower= gridPower
        
        // grid power < 0 --> increase buffer consumption, else decrease
        let delta= (-gridPower + POWER_TARGET) * 100 / BUFFER_MAX_POWER 
        
//        if (delta>5) // help convergence when ramping up
//          delta = delta *0.5 // since the dimmer position and the consumption are not linear
        
         if (on)
            print("gridPower: ", gridPower, "W   Brightness: ", brightness, "    Power: ", power, "W    On: ", on, "delta", delta)
        
        
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
              if (newBrightness != STANDBY_BRIGHTNESS && newBrightness != brightness) { // if needed
                setBrightness(newBrightness)
                
                // sleep 10 seconds to allow the power meter reading to reflect the changed load
                snooze= 10
            }
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

  // wait for the power meter to reflect the last change 
  if (snooze > 0) {
    snooze -= 1
    return
  }
  
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
  
  Timer.set(1000, false, pollHichiMeter, null)
}

// Initiate the loop
pollHichiMeter()
print("+++++ Started script +++++")
