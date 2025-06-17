// App.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  PermissionsAndroid,
  StatusBar,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import PushNotification from 'react-native-push-notification';
import Realm from 'realm';

// Schema do Realm
const ProductSchema = {
  name: 'Product',
  primaryKey: 'id',
  properties: {
    id: 'string',
    name: 'string',
    expirationDate: 'date',
    createdAt: 'date',
  },
};

// Componente principal
const App = () => {
  const [products, setProducts] = useState([]);
  const [productName, setProductName] = useState('');
  const [expirationDate, setExpirationDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [realm, setRealm] = useState(null);

  // Inicialização do Realm e notificações
  useEffect(() => {
    initializeApp();
    return () => {
      if (realm) {
        realm.close();
      }
    };
  }, []);

  const initializeApp = async () => {
    try {
      // Configurar notificações
      await configureNotifications();
      
      // Inicializar Realm
      const realmInstance = await Realm.open({
        schema: [ProductSchema],
        schemaVersion: 1,
      });
      
      setRealm(realmInstance);
      loadProducts(realmInstance);
    } catch (error) {
      console.error('Erro ao inicializar app:', error);
      Alert.alert('Erro', 'Falha ao inicializar o aplicativo');
    }
  };

  const configureNotifications = async () => {
    // Solicitar permissões no Android
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
      } catch (err) {
        console.warn(err);
      }
    }

    // Configurar canal de notificação
    PushNotification.createChannel(
      {
        channelId: 'product-expiration',
        channelName: 'Vencimento de Produtos',
        channelDescription: 'Notificações sobre produtos próximos ao vencimento',
        soundName: 'default',
        importance: 4,
        vibrate: true,
      },
      (created) => console.log(`Canal criado: ${created}`)
    );

    // Configurar notificações
    PushNotification.configure({
      onNotification: function (notification) {
        console.log('Notificação recebida:', notification);
      },
      requestPermissions: Platform.OS === 'ios',
    });
  };

  const loadProducts = (realmInstance) => {
    const allProducts = realmInstance.objects('Product').sorted('expirationDate');
    setProducts(Array.from(allProducts));
  };

  const addProduct = () => {
    if (!productName.trim()) {
      Alert.alert('Erro', 'Por favor, digite o nome do produto');
      return;
    }

    if (!realm) {
      Alert.alert('Erro', 'Banco de dados não está disponível');
      return;
    }

    try {
      realm.write(() => {
        const newProduct = {
          id: Date.now().toString(),
          name: productName.trim(),
          expirationDate: expirationDate,
          createdAt: new Date(),
        };

        realm.create('Product', newProduct);
        
        // Agendar notificações
        scheduleNotifications(newProduct);
      });

      setProductName('');
      setExpirationDate(new Date());
      loadProducts(realm);
      
      Alert.alert('Sucesso', 'Produto cadastrado com sucesso!');
    } catch (error) {
      console.error('Erro ao adicionar produto:', error);
      Alert.alert('Erro', 'Falha ao cadastrar produto');
    }
  };

  const scheduleNotifications = (product) => {
    const now = new Date();
    const expDate = new Date(product.expirationDate);
    
    // Notificação no dia do vencimento
    if (expDate > now) {
      PushNotification.localNotificationSchedule({
        id: `${product.id}_exp`,
        channelId: 'product-expiration',
        title: 'Produto Vencido!',
        message: `${product.name} venceu hoje!`,
        date: expDate,
        allowWhileIdle: true,
      });
    }

    // Notificação 7 dias antes
    const sevenDaysBefore = new Date(expDate);
    sevenDaysBefore.setDate(expDate.getDate() - 7);
    
    if (sevenDaysBefore > now) {
      PushNotification.localNotificationSchedule({
        id: `${product.id}_7d`,
        channelId: 'product-expiration',
        title: 'Produto Vence em 7 dias!',
        message: `${product.name} vence em uma semana`,
        date: sevenDaysBefore,
        allowWhileIdle: true,
      });
    }

    // Notificação 30 dias antes
    const thirtyDaysBefore = new Date(expDate);
    thirtyDaysBefore.setDate(expDate.getDate() - 30);
    
    if (thirtyDaysBefore > now) {
      PushNotification.localNotificationSchedule({
        id: `${product.id}_30d`,
        channelId: 'product-expiration',
        title: 'Produto Vence em 30 dias!',
        message: `${product.name} vence em um mês`,
        date: thirtyDaysBefore,
        allowWhileIdle: true,
      });
    }
  };

  const deleteProduct = (productId) => {
    Alert.alert(
      'Confirmar exclusão',
      'Deseja realmente excluir este produto?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            try {
              realm.write(() => {
                const productToDelete = realm.objectForPrimaryKey('Product', productId);
                if (productToDelete) {
                  realm.delete(productToDelete);
                  
                  // Cancelar notificações
                  PushNotification.cancelLocalNotifications({
                    id: `${productId}_exp`,
                  });
                  PushNotification.cancelLocalNotifications({
                    id: `${productId}_7d`,
                  });
                  PushNotification.cancelLocalNotifications({
                    id: `${productId}_30d`,
                  });
                }
              });
              
              loadProducts(realm);
              Alert.alert('Sucesso', 'Produto excluído com sucesso!');
            } catch (error) {
              console.error('Erro ao excluir produto:', error);
              Alert.alert('Erro', 'Falha ao excluir produto');
            }
          },
        },
      ]
    );
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('pt-BR');
  };

  const getDaysUntilExpiration = (expirationDate) => {
    const now = new Date();
    const expDate = new Date(expirationDate);
    const diffTime = expDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getExpirationStatus = (expirationDate) => {
    const days = getDaysUntilExpiration(expirationDate);
    
    if (days < 0) return { status: 'expired', color: '#ff4444' };
    if (days === 0) return { status: 'today', color: '#ff6b35' };
    if (days <= 7) return { status: 'warning', color: '#ffa500' };
    if (days <= 30) return { status: 'caution', color: '#ffdb4d' };
    return { status: 'ok', color: '#4caf50' };
  };

  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setExpirationDate(selectedDate);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#2196f3" barStyle="light-content" />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Controle de Validade</Text>
        <Text style={styles.headerSubtitle}>Supermercado</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Formulário de cadastro */}
        <View style={styles.formContainer}>
          <Text style={styles.sectionTitle}>Cadastrar Produto</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Nome do produto"
            value={productName}
            onChangeText={setProductName}
            maxLength={50}
          />

          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dateButtonText}>
              Data de Vencimento: {formatDate(expirationDate)}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={expirationDate}
              mode="date"
              display="default"
              onChange={onDateChange}
              minimumDate={new Date()}
            />
          )}

          <TouchableOpacity style={styles.addButton} onPress={addProduct}>
            <Text style={styles.addButtonText}>Cadastrar Produto</Text>
          </TouchableOpacity>
        </View>

        {/* Lista de produtos */}
        <View style={styles.productsContainer}>
          <Text style={styles.sectionTitle}>
            Produtos Cadastrados ({products.length})
          </Text>

          {products.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                Nenhum produto cadastrado ainda
              </Text>
            </View>
          ) : (
            products.map((product) => {
              const { status, color } = getExpirationStatus(product.expirationDate);
              const daysLeft = getDaysUntilExpiration(product.expirationDate);

              return (
                <View key={product.id} style={styles.productCard}>
                  <View style={styles.productInfo}>
                    <Text style={styles.productName}>{product.name}</Text>
                    <Text style={styles.productDate}>
                      Vence em: {formatDate(product.expirationDate)}
                    </Text>
                    <Text style={[styles.productStatus, { color }]}>
                      {daysLeft < 0 
                        ? `Vencido há ${Math.abs(daysLeft)} dias`
                        : daysLeft === 0
                        ? 'Vence hoje!'
                        : `${daysLeft} dias restantes`
                      }
                    </Text>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => deleteProduct(product.id)}
                  >
                    <Text style={styles.deleteButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#2196f3',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#e3f2fd',
    marginTop: 5,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  formContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 15,
    backgroundColor: '#fafafa',
  },
  dateButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    backgroundColor: '#fafafa',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#333',
  },
  addButton: {
    backgroundColor: '#4caf50',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  productsContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
  },
  productCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  productDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 3,
  },
  productStatus: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#ff4444',
    borderRadius: 20,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default App;