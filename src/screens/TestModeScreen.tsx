import React, {useState} from 'react';
import {Text} from 'react-native';
import {Screen} from '../components/Screen';
import {Card} from '../components/Card';
import {AppTextInput} from '../components/AppTextInput';
import {PrimaryButton} from '../components/PrimaryButton';
import {testModeService} from '../services/TestModeService';
import {useThemeColors} from '../hooks/useThemeColors';
import {loggingService} from '../services/LoggingService';

export const TestModeScreen = () => {
  const colors = useThemeColors();
  const [sms, setSms] = useState('');
  const [result, setResult] = useState<ReturnType<typeof testModeService.previewSms>>();

  const simulate = async () => {
    const preview = testModeService.previewSms(sms);
    setResult(preview);
    await loggingService.log('system', `Test mode preview generated: ${preview.kind}`);
  };

  return (
    <Screen>
      <Card title="Paste Fake SMS">
        <AppTextInput
          label="SMS body"
          value={sms}
          onChangeText={setSms}
          multiline
          numberOfLines={6}
          style={{minHeight: 140, textAlignVertical: 'top'}}
        />
        <PrimaryButton label="Parse and Simulate" onPress={simulate} />
      </Card>

      {result ? (
        <Card title="Simulation Result">
          <Text style={{color: colors.text}}>Type: {result.kind}</Text>
          <Text style={{color: colors.text}}>Can automate: {result.canAutomate ? 'Yes' : 'No'}</Text>
          <Text style={{color: colors.text}}>Parsed: {JSON.stringify(result.parsed, null, 2)}</Text>
          <Text style={{color: colors.text}}>USSD preview: {result.ussdPreview ?? 'N/A'}</Text>
          <Text style={{color: colors.muted}}>Reason: {result.reason ?? 'Ready'}</Text>
        </Card>
      ) : null}
    </Screen>
  );
};
