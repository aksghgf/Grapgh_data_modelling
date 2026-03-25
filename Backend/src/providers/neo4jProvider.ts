import neo4j, { Driver, Record as Neo4jRecord, Session } from "neo4j-driver";
import type { AppConfig } from "../config/env.js";

/**
 * Thin wrapper around the Neo4j driver for session lifecycle.
 */
export class Neo4jProvider {
  private readonly driver: Driver;

  constructor(config: AppConfig) {
    console.log('Neo4j Configuration:');
    console.log('- URI:', config.neo4jUri);
    console.log('- User:', config.neo4jUser);
    console.log('- Password:', config.neo4jPassword ? '[REDACTED]' : '[MISSING]');
    
    this.driver = neo4j.driver(config.neo4jUri, neo4j.auth.basic(config.neo4jUser, config.neo4jPassword));
    
    // Test connection on startup
    this.testConnection();
  }

  /**
   * Test Neo4j connection on startup
   */
  private async testConnection(): Promise<void> {
    try {
      const session = this.driver.session();
      await session.run('RETURN 1 as test');
      await session.close();
      console.log('Neo4j Connection: ✅ Successfully connected');
    } catch (error) {
      console.error('Neo4j Connection: ❌ Failed to connect:', error);
    }
  }

  /**
   * Runs a read query and returns driver records (preserves Node/Relationship types for graph mapping).
   */
  async runReadQuery(cypher: string, params: Record<string, unknown> = {}): Promise<Neo4jRecord[]> {
    const session: Session = this.driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      // Use executeRead for better transaction handling
      const result = await session.executeRead(async (tx) => {
        return await tx.run(cypher, params);
      });
      
      // Debug logging for connection verification
      console.log('Neo4j Connection Status: Connected');
      console.log('Neo4j Query:', cypher);
      console.log('Neo4j Params:', params);
      
      return [...result.records];
    } catch (error) {
      console.error('Neo4j Query Error:', error);
      console.error('Neo4j Query that failed:', cypher);
      console.error('Neo4j Params:', params);
      throw error;
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}
