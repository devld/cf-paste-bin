# cf-paste-bin

A Paste Bin running on Cloudflare Worker.

## Features

- Basic text sharing
- Expiration time
- File sharing
- Markdown rendering

## Deployment & Running

1. Create a Worker and select `Clone a repository via Git URL`, with the repository URL `https://github.com/devld/cf-paste-bin.git`
2. Create a D1 Database and initialize the database tables using [Wrangler to execute `src/init.sql`](https://developers.cloudflare.com/d1/wrangler-commands/#d1-execute)
3. Create an R2 Bucket
   - [Create an API Key](https://developers.cloudflare.com/r2/api/s3/tokens/) and select `Read and Write Objects` as the permission for the API Key
   - Set the `CORS policy` for the R2 Bucket as follows (replace `https://example.com` with your Paste Bin domain):
     ```json
     [
       {
         "AllowedOrigins": ["https://example.com"],
         "AllowedMethods": ["GET", "PUT"],
         "AllowedHeaders": ["Content-Type"]
       }
     ]
     ```
4. In the Worker settings, bind the D1 Database and ensure the `Variable Name` is set to `DB`
5. In the Worker settings, add the following `Variables and Secrets`:
   - `S3_ENDPOINT`: The API address of your R2 Bucket, found on the settings page of your created R2 Bucket, formatted as `S3 API: https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - `S3_ACCESS_KEY`: The `Access Key ID` of your created API Key
   - `S3_SECRET_KEY`: The `Secret Access Key` of your created API Key
