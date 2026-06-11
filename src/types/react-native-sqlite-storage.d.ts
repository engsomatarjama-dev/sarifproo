declare module 'react-native-sqlite-storage' {
  export interface ResultSetRowList {
    length: number;
    item(index: number): any;
    raw(): any[];
  }

  export interface ResultSet {
    insertId?: number;
    rowsAffected: number;
    rows: ResultSetRowList;
  }

  export interface SQLiteDatabase {
    executeSql(statement: string, params?: any[]): Promise<[ResultSet]>;
  }

  export interface OpenArgs {
    name: string;
    location: string;
  }

  const SQLite: {
    enablePromise(enable: boolean): void;
    openDatabase(args: OpenArgs): Promise<SQLiteDatabase>;
  };

  export default SQLite;
}
