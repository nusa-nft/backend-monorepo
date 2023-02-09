/*
 *
 * HomePage
 *
 */

import React, { useEffect, useState } from 'react';
import pluginId from '../../pluginId';
import axiosInstance from '../../utils/axiosInstance';
import { Main } from '@strapi/design-system';
import {
  Tbody,
  Tr,
  Td,
  Typography,
  Avatar,
  BaseButton,
  Box,
  Flex,
} from '@strapi/design-system';
import { DynamicTable, PaginationURLQuery } from '@strapi/helper-plugin';
import { useLocation } from 'react-router-dom';


const HomePage: React.VoidFunctionComponent = () => {
  const [rows, setRows] = useState<any[]>([])
  const [pagination, setPagination] = useState({
    pageCount: 1,
  });
  const location = useLocation();

  useEffect(() => {
    getItems(location.search);
  }, [location.search]);

  const headers = [
    { key: '1', name: 'name', metadatas: { label: 'Name', sortable: false } },
    { key: '2', name: 'banner_image', metadatas: { label: 'Banner Image', sortable: false } },
    { key: '3', name: 'creator', metadatas: { label: 'Creator', sortable: false } },
    { key: '4', name: 'action', metadatas: { label: 'Action', sortable: false } },
  ]

  const getItems = async (queryString) => {
    let queryParams = '?page=1';
    if (queryString) {
      queryParams = queryString;
    }
    const resp = await axiosInstance.get(`/nft-curate/curated-collections${queryParams}`)
    console.log({ resp })
    setRows(resp.data.records ?? []);
    setPagination({ pageCount: resp.data.metadata?.pageCount || 1 })
  }

  const addToCuratedList = async (collectionId: number) => {
    const resp = await axiosInstance.post(`/nft-curate/curated-collections`, { collectionId, isCurated: true });
    await getItems(location.search);
  }

  const removeFromCuratedList = async (collectionId: number) => {
    const resp = await axiosInstance.post(`/nft-curate/curated-collections`, { collectionId, isCurated: false });
    await getItems(location.search);
  }


  return (
    <Main>
      <Box padding={4}>
        <DynamicTable
          contentType={'Curated Items'}
          headers={headers}
          rows={rows}
        >
          <Tbody>
            {rows.map(entry => 
              <Tr key={entry.id}>
                <Td>
                  <a href={entry.viewLink} target="_blank">
                    <Typography textColor="neutral800">{entry.name}</Typography>
                  </a>
                </Td>
                <Td>
                  <Avatar src={entry.banner_image} alt={entry.banner_image} />
                </Td>
                <Td>
                  <Typography textColor="neutral800">{entry.Creator ? entry.Creator.username : entry.creator_address}</Typography>
                </Td>
                <Td>
                  {entry.isCurated ? (
                    <BaseButton onClick={() => removeFromCuratedList(entry.id)} style={{ backgroundColor: 'red' }}>
                      <Typography>Remove</Typography>
                    </BaseButton>
                  ): (
                    <BaseButton onClick={() => addToCuratedList(entry.id)} style={{ backgroundColor: 'green' }}>
                      <Typography>Add</Typography>
                    </BaseButton>
                  )}
                </Td>
              </Tr>
            )}
          </Tbody>
        </DynamicTable>
        <Box paddingTop={4}>
          <Flex alignItems="flex-end" justifyContent="space-between">
            {/* <PageSizeURLQuery /> */}
            <PaginationURLQuery pagination={pagination} />
          </Flex>
        </Box>
      </Box>
    </Main>
  )
};

export default HomePage;
