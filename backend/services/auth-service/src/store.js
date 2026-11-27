function statements(db) {
  return {
    async insertUser(user) {
      try {
        await db.execute(
          `INSERT INTO app_user (user_id, email, display_name, password_hash, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [user.user_id, user.email, user.display_name, user.password_hash, user.role, user.created_at, user.created_at]
        );
        return true;
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return false;
        throw error;
      }
    },

    async findUser(email, lock = false) {
      const [rows] = await db.execute('SELECT * FROM app_user WHERE email = ?' + (lock ? ' FOR UPDATE' : ''), [email]);
      return rows[0];
    },

    async findSession(tokenHash, role) {
      const [rows] = await db.execute(
        `SELECT u.user_id, u.email, u.display_name, u.role, u.account_status, s.expires_at
         FROM auth_session s JOIN app_user u ON u.user_id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3) AND u.account_status = 'ACTIVE' AND u.role = ?`,
        [tokenHash, role]
      );
      return rows[0];
    },

    async createSession(tokenHash, userId, expiresAt, previousHash, role) {
      await db.execute('INSERT INTO auth_session (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
        [tokenHash, userId, expiresAt]);
      if (previousHash) await this.revokeSession(previousHash, role);
    },

    async revokeSession(tokenHash, role) {
      await db.execute(
        `DELETE FROM auth_session WHERE token_hash = ?
         AND user_id IN (SELECT user_id FROM app_user WHERE role = ?)`,
        [tokenHash, role]
      );
    }
  };
}

function openAuthStore(pool) {
  let nextCleanup = 0;

  return {
    ...statements(pool),
    async transaction(write) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const result = await write(statements(connection));
        await connection.commit();
        if (Date.now() >= nextCleanup) {
          nextCleanup = Date.now() + 60_000;
          void pool.execute('DELETE FROM auth_session WHERE expires_at <= UTC_TIMESTAMP(3) LIMIT 500')
            .catch((error) => console.error('Auth cleanup:', error.code || error.name));
        }
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }
  };
}

module.exports = { openAuthStore };
