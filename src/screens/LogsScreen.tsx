import React, {useCallback} from 'react';
import {FlatList, StyleSheet, Text} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {Screen} from '../components/Screen';
import {Card} from '../components/Card';
import {useAppStore} from '../store/useAppStore';
import {appStartupService} from '../services/AppStartupService';
import {formatDateTime} from '../utils/format';
import {useThemeColors} from '../hooks/useThemeColors';

export const LogsScreen = () => {
  const colors = useThemeColors();
  const logs = useAppStore(state => state.logs);

  useFocusEffect(
    useCallback(() => {
      void appStartupService.refreshAll();
    }, []),
  );

  return (
    <Screen scroll={false}>
      <FlatList
        contentContainerStyle={styles.list}
        data={logs}
        keyExtractor={item => `${item.timestamp}-${item.message}`}
        ListEmptyComponent={<Text style={{color: colors.muted}}>No logs yet.</Text>}
        renderItem={({item}) => (
          <Card title={item.type}>
            <Text style={{color: colors.text}}>{item.message}</Text>
            <Text style={{color: colors.muted}}>{formatDateTime(item.timestamp)}</Text>
          </Card>
        )}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  list: {
    gap: 12,
    paddingBottom: 32,
  },
});
