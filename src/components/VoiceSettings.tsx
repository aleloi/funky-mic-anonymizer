import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export interface VoiceSettings {
  phaseMultiplier: number;
  frequencyShiftMultiplier: number;
  harmonicAmount: number;
  noiseAmount: number;
  useFrequencyScrambling: boolean;
  useAdditionalPhaseDistortion: boolean;
  useTimeDistortion: boolean;
  timeDistortionAmount: number;
}

interface VoiceSettingsProps {
  settings: VoiceSettings;
  onChange: (settings: VoiceSettings) => void;
}

export const defaultVoiceSettings: VoiceSettings = {
  phaseMultiplier: 3,
  frequencyShiftMultiplier: 5,
  harmonicAmount: 0.2,
  noiseAmount: 0.5,
  useFrequencyScrambling: true,
  useAdditionalPhaseDistortion: true,
  useTimeDistortion: true,
  timeDistortionAmount: 3,
};

export function VoiceSettings({ settings, onChange }: VoiceSettingsProps) {
  const updateSetting = <K extends keyof VoiceSettings>(
    key: K,
    value: VoiceSettings[K]
  ) => {
    onChange({
      ...settings,
      [key]: value,
    });
  };

  return (
    <Card className="p-4 space-y-4 bg-black/90 backdrop-blur-md border border-[#9b87f5]/30">
      <h3 className="text-lg font-semibold mb-4 text-white">Voice Settings</h3>
      
      <div className="space-y-6 text-gray-100">
        <div className="space-y-4">
          <Label className="text-gray-200">Phase Inversion Intensity</Label>
          <Slider
            value={[settings.phaseMultiplier]}
            onValueChange={([value]) => updateSetting("phaseMultiplier", value)}
            min={1}
            max={10}
            step={0.1}
            className="[&>[role=slider]]:bg-[#9b87f5]"
          />
        </div>

        <div className="space-y-4">
          <Label className="text-gray-200">Frequency Shift Amount</Label>
          <Slider
            value={[settings.frequencyShiftMultiplier]}
            onValueChange={([value]) => updateSetting("frequencyShiftMultiplier", value)}
            min={1}
            max={10}
            step={0.1}
            className="[&>[role=slider]]:bg-[#9b87f5]"
          />
        </div>

        <Separator className="bg-white/10" />

        <div className="space-y-4">
          <Label className="text-gray-200">Harmonic Distortion</Label>
          <Slider
            value={[settings.harmonicAmount]}
            onValueChange={([value]) => updateSetting("harmonicAmount", value)}
            min={0}
            max={1}
            step={0.01}
            className="[&>[role=slider]]:bg-[#9b87f5]"
          />
        </div>

        <div className="space-y-4">
          <Label className="text-gray-200">Noise Amount</Label>
          <Slider
            value={[settings.noiseAmount]}
            onValueChange={([value]) => updateSetting("noiseAmount", value)}
            min={0}
            max={1}
            step={0.01}
            className="[&>[role=slider]]:bg-[#9b87f5]"
          />
        </div>

        <Separator className="bg-white/10" />

        <div className="flex items-center space-x-2">
          <Checkbox
            id="scrambling"
            checked={settings.useFrequencyScrambling}
            onCheckedChange={(checked) => 
              updateSetting("useFrequencyScrambling", checked as boolean)
            }
            className="border-[#9b87f5]/50 data-[state=checked]:bg-[#9b87f5]"
          />
          <Label htmlFor="scrambling" className="text-gray-200">Enable Frequency Scrambling</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="phaseDistortion"
            checked={settings.useAdditionalPhaseDistortion}
            onCheckedChange={(checked) => 
              updateSetting("useAdditionalPhaseDistortion", checked as boolean)
            }
            className="border-[#9b87f5]/50 data-[state=checked]:bg-[#9b87f5]"
          />
          <Label htmlFor="phaseDistortion" className="text-gray-200">Additional Phase Distortion</Label>
        </div>

        <Separator className="bg-white/10" />

        <div className="flex items-center space-x-2">
          <Checkbox
            id="timeDistortion"
            checked={settings.useTimeDistortion}
            onCheckedChange={(checked) => 
              updateSetting("useTimeDistortion", checked as boolean)
            }
            className="border-[#9b87f5]/50 data-[state=checked]:bg-[#9b87f5]"
          />
          <Label htmlFor="timeDistortion" className="text-gray-200">Enable Time Domain Distortion</Label>
        </div>

        {settings.useTimeDistortion && (
          <div className="space-y-4 mt-2">
            <Label className="text-gray-200">Time Distortion Amount</Label>
            <Slider
              value={[settings.timeDistortionAmount]}
              onValueChange={([value]) => updateSetting("timeDistortionAmount", value)}
              min={1}
              max={10}
              step={0.1}
              className="[&>[role=slider]]:bg-[#9b87f5]"
            />
          </div>
        )}
      </div>
    </Card>
  );
}
